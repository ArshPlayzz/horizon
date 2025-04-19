import { useRef, useEffect, useCallback, memo, useState, useMemo } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import {
    SidebarInset,
    SidebarProvider,
    useSidebar
} from "@/components/ui/sidebar"
import { CodeEditor } from "./components/code-editor"
import { FileInfo } from "./lib/file-service"
import { ImageViewer } from "@/components/image-viewer"
import { convertFileSrc } from "@tauri-apps/api/core"
import Terminal from "./components/terminal"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
import { FileSelectionTabs } from "@/components/ui/file-selection-tabs"
import { IconLayoutSidebar, IconLayoutBottombar, IconLayoutSidebarFilled, IconLayoutBottombarFilled } from "@tabler/icons-react"
import { AudioPlayer } from "@/components/audio-player.tsx"
import { useFileStore } from "@/lib/stores"

interface TerminalInstance {
  id: string;
  name: string;
  state: {
    output: string[];
    currentInput: string;
    sessionId: string | null;
    commandHistory: string[];
    historyIndex: number;
    isLocked: boolean;
  };
  workingDirectory: string;
  processName: string;
}

// Wydzielamy oddzielny komponent dla edytora kodu, który będzie memoizowany na najwyższym poziomie
const EditorContainer = memo(({ file, language, onChangeContent, onSave }: {
    file: FileInfo;
    language: string;
    onChangeContent: (content: string) => void;
    onSave: () => void;
}) => {
    console.log('EditorContainer render', { 
        fileId: file.id,
        filePath: file.path, 
        language
    });
    
    // Tworzenie funkcji handleChange i handleSave jest tutaj bezpieczne,
    // ponieważ cały komponent jest memoizowany
    const handleChange = (content: string) => {
        console.log('handleChange in EditorContainer', { 
            contentLength: content.length, 
            contentPreview: content.substring(0, 20) + '...'
        });
        onChangeContent(content);
    };
    
    const handleSave = () => {
        console.log('handleSave in EditorContainer');
        onSave();
    };
    
    return (
        <CodeEditor 
            initialValue={file.content}
            onChange={handleChange}
            language={language}
            onSave={handleSave}
        />
    );
}, (prevProps, nextProps) => {
    // Komponent zostanie przerenderowany tylko jeśli zmieni się ID pliku,
    // ścieżka pliku, język lub zawartość
    const isEqual = prevProps.file.id === nextProps.file.id &&
                   prevProps.file.path === nextProps.file.path &&
                   prevProps.language === nextProps.language;
    
    console.log('EditorContainer memo check', { 
        isEqual,
        prevId: prevProps.file.id,
        nextId: nextProps.file.id,
        prevPath: prevProps.file.path,
        nextPath: nextProps.file.path,
        prevLanguage: prevProps.language,
        nextLanguage: nextProps.language
    });
    
    return isEqual;
});

function MainContent() {
    const { 
        currentFile, 
        updateFileContent, 
        activeFilePath,
        isImageFile,
        isAudioFile,
        saveFile
    } = useFileStore();
    
    const { state: sidebarState } = useSidebar();
    const prevFilePathRef = useRef<string | null>(null);
    
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [terminalInstances, setTerminalInstances] = useState<TerminalInstance[]>([]);
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    
    const handleContentChange = useCallback((content: string) => {
        console.log('handleContentChange in App', { 
            contentLength: content.length, 
            contentPreview: content.substring(0, 20) + '...',
            currentFileId: currentFile?.id,
            currentFilePath: currentFile?.path
        });
        updateFileContent(content);
    }, [updateFileContent]);

    const handleSaveFile = useCallback(() => {
        if (currentFile) {
            console.log('Saving file:', {
                path: currentFile.path,
                id: currentFile.id,
                contentLength: currentFile.content.length,
                contentPreview: currentFile.content.substring(0, 20) + '...'
            });
            saveFile(currentFile.content);
        }
    }, [saveFile, currentFile?.id, currentFile?.path]);
    
    useEffect(() => {
        if (prevFilePathRef.current !== activeFilePath) {
            prevFilePathRef.current = activeFilePath;
        }
    }, [activeFilePath]);
    
    const getLanguageFromExtension = useCallback((fileName: string) => {
        if (!fileName || !fileName.includes('.')) return 'typescript';
        
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js': return 'javascript';
            case 'jsx': return 'jsx';
            case 'ts': return 'typescript';
            case 'tsx': return 'tsx';
            case 'mjs': return 'mjs';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'json': return 'json';
            
            case 'py': return 'python';
            case 'rb': return 'ruby';
            case 'php': return 'php';
            case 'java': return 'java';
            case 'go': return 'go';
            case 'rs': return 'rust';
            case 'c': return 'c';
            case 'cpp': 
            case 'cc':
            case 'cxx': return 'cpp';
            case 'cs': return 'csharp';
            
            case 'yml':
            case 'yaml': return 'yaml';
            case 'xml': return 'xml';
            case 'md': return 'markdown';
            case 'sql': return 'sql';
            
            case 'sh':
            case 'bash': return 'shell';
            
            case 'swift': return 'swift';
            case 'kt': return 'kotlin';
            case 'dart': return 'dart';
            
            case 'sass':
            case 'scss': return 'sass';
            case 'less': return 'less';
            
            default: return 'typescript';
        }
    }, []);

    const fileLanguage = useMemo(() => 
        currentFile ? getLanguageFromExtension(currentFile.name) : 'typescript',
    [currentFile?.name, getLanguageFromExtension]);

    // Kontener dla edytora który będzie stabilnym elementem drzewa DOM
    const EditorContentArea = useMemo(() => {
        console.log('Rendering EditorContentArea', {
            hasCurrentFile: Boolean(currentFile),
            filePath: currentFile?.path,
            fileId: currentFile?.id,
            language: fileLanguage
        });
        
        if (!currentFile) {
            return (
                <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                        No file selected
                    </p>
                </div>
            );
        }
        
        if (isImageFile(currentFile.path)) {
            return <ImageViewer src={convertFileSrc(currentFile.path)} />;
        }
        
        if (isAudioFile(currentFile.path)) {
            return (
                <div className="h-full">
                    <AudioPlayer 
                        key={currentFile.path}
                        src={convertFileSrc(currentFile.path)} 
                        fileName={currentFile.name}
                    />
                </div>
            );
        }
        
        // Zabezpieczenie przed niezdefiniowanym plikiem
        return (
            <EditorContainer
                file={currentFile}
                language={fileLanguage}
                onChangeContent={handleContentChange}
                onSave={handleSaveFile}
            />
        );
    }, [
        currentFile?.id, // Główna zależność - zmiana tylko gdy zmienia się plik
        fileLanguage,
        handleContentChange,
        handleSaveFile,
        isImageFile,
        isAudioFile
    ]);

    return (
        <ThemeProvider forceDarkMode={true}>
            <AppSidebar variant="inset"/>
            <SidebarInset className="border rounded-xl select-none">
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-sidebar rounded-t-xl">
                    <FileSelectionTabs />
                    <div className="ml-auto flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                            title="Toggle Sidebar"
                        >
                            {sidebarState === "collapsed" ? (
                                <IconLayoutSidebar className="h-4 w-4" />
                            ) : (
                                <IconLayoutSidebarFilled className="h-4 w-4" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsTerminalVisible(!isTerminalVisible)}
                            title={isTerminalVisible ? "Hide Terminal" : "Show Terminal"}
                        >
                            {isTerminalVisible ? (
                                <IconLayoutBottombarFilled className="h-4 w-4" />
                            ) : (
                                <IconLayoutBottombar className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </header>
                
                <div className="flex flex-1 flex-col rounded-b-xl">
                    <ResizablePanelGroup direction="vertical">
                        <ResizablePanel defaultSize={isTerminalVisible ? 60 : 100}>
                            {EditorContentArea}
                        </ResizablePanel>
                        {isTerminalVisible && (
                            <>
                                <ResizableHandle />
                                <ResizablePanel defaultSize={40}>
                                    <div className="select-text w-full h-full">
                                        <Terminal
                                            onClose={() => setIsTerminalVisible(false)}
                                            isTerminalVisible={isTerminalVisible}
                                            instances={terminalInstances}
                                            setInstances={setTerminalInstances}
                                            activeInstanceId={activeTerminalId}
                                            setActiveInstanceId={setActiveTerminalId}
                                        />
                                    </div>
                                </ResizablePanel>
                            </>
                        )}
                    </ResizablePanelGroup>
                </div>
            </SidebarInset>
        </ThemeProvider>
    );
}

export default function App() {
    return (
        <SidebarProvider>
            <MainContent />
        </SidebarProvider>
    );
}

import { useRef, useEffect, useCallback, memo, useState } from "react"
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

function MainContent() {
    const { 
        currentFile, 
        updateFileContent, 
        activeFilePath,
        isImageFile,
        isAudioFile
    } = useFileStore();
    
    const { state: sidebarState } = useSidebar();
    const prevFilePathRef = useRef<string | null>(null);
    
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [terminalInstances, setTerminalInstances] = useState<TerminalInstance[]>([]);
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    
    useEffect(() => {
        if (prevFilePathRef.current !== activeFilePath) {
            prevFilePathRef.current = activeFilePath;
        }
    }, [activeFilePath]);
    
    const getLanguageFromExtension = (fileName: string) => {
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
    };

    const fileLanguage = currentFile 
        ? getLanguageFromExtension(currentFile.name) 
        : 'typescript';
    
    const handleContentChange = useCallback((content: string) => {
        console.log('handleContentChange in App', { contentLength: content.length });
        updateFileContent(content);
    }, [updateFileContent]);

    interface MemoizedCodeEditorProps {
        file: FileInfo;
        onChangeContent: (content: string) => void;
        language: string;
        onSave: () => void;
    }

    const MemoizedCodeEditor = memo<MemoizedCodeEditorProps>(
        ({ file, onChangeContent, language, onSave }) => {
            console.log('MemoizedCodeEditor render', { 
                filePath: file.path, 
                language,
                contentLength: file.content.length,
                isUnsaved: file.isUnsaved
            });
            
            const fileContentRef = useRef(file.content);
            const isUnsavedRef = useRef(file.isUnsaved);
            
            useEffect(() => {
                fileContentRef.current = file.content;
            }, [file.path]);
            
            const handleChange = useCallback((content: string) => {
                console.log('handleChange in MemoizedCodeEditor', { contentLength: content.length });
                fileContentRef.current = content;
                isUnsavedRef.current = true; 
                onChangeContent(content);
            }, [onChangeContent]);
            
            const handleSave = useCallback(() => {
                console.log('handleSave in MemoizedCodeEditor');
                isUnsavedRef.current = false; 
                onSave();
            }, [onSave]);
            
            return (
                <CodeEditor 
                    initialValue={fileContentRef.current}
                    onChange={handleChange}
                    language={language}
                    onSave={handleSave}
                />
            );
        },
        (prevProps, nextProps) => {
            const prevInfo = {
                path: prevProps.file.path,
                language: prevProps.language,
                contentLength: prevProps.file.content.length,
                isUnsaved: prevProps.file.isUnsaved
            };
            
            const nextInfo = {
                path: nextProps.file.path,
                language: nextProps.language,
                contentLength: nextProps.file.content.length,
                isUnsaved: nextProps.file.isUnsaved
            };
            
            const shouldNotUpdate = (
                prevInfo.path === nextInfo.path && 
                prevInfo.language === nextInfo.language
            );
            
            console.log('MemoizedCodeEditor memo check', { 
                shouldNotUpdate, 
                prevInfo, 
                nextInfo 
            });
            
            return shouldNotUpdate;
        }
    );

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
                        <ResizablePanel defaultSize={60}>
                            {currentFile ? (
                                isImageFile(currentFile.path) ? (
                                    <ImageViewer src={convertFileSrc(currentFile.path)} />
                                ) : isAudioFile(currentFile.path) ? (
                                    <div className="h-full">
                                        <AudioPlayer 
                                            key={currentFile.path}
                                            src={convertFileSrc(currentFile.path)} 
                                            fileName={currentFile.name}
                                        />
                                    </div>
                                ) : (
                                    <MemoizedCodeEditor
                                        key={activeFilePath}
                                        file={currentFile}
                                        onChangeContent={handleContentChange}
                                        language={fileLanguage}
                                        onSave={() => {}}
                                    />
                                )
                            ) : (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-sm text-muted-foreground">
                                        No file selected
                                    </p>
                                </div>
                            )}
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

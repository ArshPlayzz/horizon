import { useRef, useEffect, useCallback, memo, useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"
import { CodeEditor } from "./components/code-editor"
import { FileContextProvider, useFileContext } from "./lib/file-context"
import { FileInfo } from "./lib/file-service"
import { ImageViewer } from "@/components/image-viewer"
import { convertFileSrc } from "@tauri-apps/api/core"
import Terminal from "./components/terminal"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { PanelBottom, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FileSelectionTabs } from "@/components/ui/file-selection-tabs"

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

function AppContent() {
    const { 
        currentFile, 
        updateFileContent, 
        activeFilePath,
        isImageFile
    } = useFileContext();
    
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
        updateFileContent(content);
    }, [updateFileContent]);

    interface MemoizedCodeEditorProps {
        file: FileInfo;
        onChangeContent: (content: string) => void;
        language: string;
    }

    const MemoizedCodeEditor = memo<MemoizedCodeEditorProps>(
        ({ file, onChangeContent, language }) => {
            
            const handleChange = useCallback((content: string) => {
                onChangeContent(content);
            }, [onChangeContent]);
            
            return (
                <CodeEditor 
                    initialValue={file.content}
                    onChange={handleChange}
                    language={language}
                />
            );
        },
        (prevProps, nextProps) => {
            return (
                prevProps.file.path === nextProps.file.path &&
                prevProps.language === nextProps.language
            );
        }
    );

    return (
        <ThemeProvider forceDarkMode={true}>
            <SidebarProvider>
                <AppSidebar variant="inset"/>
                <SidebarInset className="overflow-hidden border-muted border rounded-lg">
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-sidebar">
                        <FileSelectionTabs />
                        <div className="ml-auto flex gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                                title="Toggle Sidebar"
                            >
                                <PanelLeft className="h-5 w-5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setIsTerminalVisible(!isTerminalVisible)}
                                title={isTerminalVisible ? "Hide Terminal" : "Show Terminal"}
                            >
                                <PanelBottom className="h-5 w-5" />
                            </Button>
                        </div>
                    </header>
                    
                    <div className="flex flex-1 flex-col">
                        <ResizablePanelGroup direction="vertical">
                            <ResizablePanel defaultSize={60}>
                                {currentFile ? (
                                    isImageFile(currentFile.path) ? (
                                        <ImageViewer src={convertFileSrc(currentFile.path)} />
                                    ) : (
                                        <MemoizedCodeEditor
                                            key={activeFilePath}
                                            file={currentFile}
                                            onChangeContent={handleContentChange}
                                            language={fileLanguage}
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
                                        <Terminal
                                            onClose={() => setIsTerminalVisible(false)}
                                            isTerminalVisible={isTerminalVisible}
                                            instances={terminalInstances}
                                            setInstances={setTerminalInstances}
                                            activeInstanceId={activeTerminalId}
                                            setActiveInstanceId={setActiveTerminalId}
                                        />
                                    </ResizablePanel>
                                </>
                            )}
                        </ResizablePanelGroup>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    );
}

export default function App() {
    return (
        <FileContextProvider>
            <AppContent />
        </FileContextProvider>
    );
}

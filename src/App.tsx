import React, { useRef, useEffect, useCallback, useMemo, memo } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { CodeEditor } from "./components/code-editor"
import { FileContextProvider, useFileContext } from "./lib/file-context"
import { FileInfo } from "./lib/file-service"
import { ImageViewer } from "@/components/image-viewer"
import { convertFileSrc } from "@tauri-apps/api/core"

// Komponent wewnętrzny, który korzysta z kontekstu
function AppContent() {
    const { 
        currentFile, 
        updateFileContent, 
        currentDirectory, 
        directoryStructure,
        activeFilePath,
        isImageFile
    } = useFileContext();
    
    // Używamy useRef do śledzenia poprzednich wartości bez powodowania renderowania
    const prevFilePathRef = useRef<string | null>(null);
    
    // Redukujemy liczbę efektów generujących logi - są one źródłem problemów z wydajnością
    useEffect(() => {
        if (prevFilePathRef.current !== activeFilePath) {
            console.log(`AppContent: zmiana pliku na: ${activeFilePath || 'brak'}`);
            prevFilePathRef.current = activeFilePath;
        }
    }, [activeFilePath]);
    
    // Funkcja do generowania uproszczonych breadcrumbs
    const generateBreadcrumbs = () => {
        if (!currentFile || !currentDirectory) return [];
        
        // Upewnij się, że ścieżki używają jednolitego separatora
        const normalizedFilePath = currentFile.path.replace(/\\/g, '/');
        const normalizedDirPath = currentDirectory.replace(/\\/g, '/');
        
        // Znajdź nazwę folderu głównego (ostatni segment ścieżki folderu)
        const rootFolderName = normalizedDirPath.split('/').pop() || '';
        
        // Sprawdź, czy ścieżka pliku zaczyna się od ścieżki folderu
        if (normalizedFilePath.startsWith(normalizedDirPath)) {
            // Wyodrębnij względną ścieżkę, zaczynając od głównego folderu
            const relativePath = normalizedFilePath.substring(normalizedDirPath.length);
            
            // Podziel względną ścieżkę na segmenty
            const segments = relativePath.split('/').filter(Boolean);
            
            // Dodaj nazwę pliku na końcu
            const fileName = currentFile.name;
            
            // Zwróć tablicę z nazwą folderu głównego + segmenty względnej ścieżki
            return [rootFolderName, ...segments];
        }
        
        // Jeśli ścieżka pliku nie zaczyna się od ścieżki folderu, użyj tylko nazwy pliku
        return [currentFile.name];
    };
    
    // Wygeneruj breadcrumbs
    const breadcrumbs = generateBreadcrumbs();
    
    // Funkcja do określania języka na podstawie rozszerzenia pliku
    const getLanguageFromExtension = (fileName: string) => {
        if (!fileName || !fileName.includes('.')) return 'typescript';
        
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            // Web languages
            case 'js': return 'javascript';
            case 'jsx': return 'jsx';
            case 'ts': return 'typescript';
            case 'tsx': return 'tsx';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'json': return 'json';
            
            // Backend languages - fallback to text if no specific support
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
            
            // Data formats
            case 'yml':
            case 'yaml': return 'yaml';
            case 'xml': return 'xml';
            case 'md': return 'markdown';
            case 'sql': return 'sql';
            
            // Shell scripts
            case 'sh':
            case 'bash': return 'shell';
            
            // Mobile
            case 'swift': return 'swift';
            case 'kt': return 'kotlin';
            case 'dart': return 'dart';
            
            default: return 'typescript';
        }
    };

    // Określamy język na podstawie nazwy pliku
    const fileLanguage = currentFile 
        ? getLanguageFromExtension(currentFile.name) 
        : 'typescript';
    
    // Obsługa zmiany zawartości edytora - nie powodujemy rerenderów
    const handleContentChange = useCallback((content: string) => {
        // Po prostu aktualizujemy zawartość bez powodowania ponownych renderowań
        updateFileContent(content);
    }, [updateFileContent]);

    // Wymuszamy re-render edytora przy zmianie pliku używając klucza
    // Używamy stabilnego klucza na bazie ścieżki pliku
    const editorKey = useMemo(() => {
        if (!currentFile) return 'empty';
        // Używamy tylko ścieżki pliku jako klucza
        return `file-${currentFile.path}`;
    }, [currentFile?.path]);

    // Definicja interfejsu MemoizedCodeEditor
    interface MemoizedCodeEditorProps {
        file: FileInfo;
        onChangeContent: (content: string) => void;
        language: string;
    }

    // Opakowanie CodeEditor w React.memo
    const MemoizedCodeEditor = memo<MemoizedCodeEditorProps>(
        ({ file, onChangeContent, language }) => {
            // Usuwamy zbędne logowanie
            // console.log(`MemoizedCodeEditor: renderowanie dla pliku ${file.name}`);
            
            // Używamy stałej referencji do funkcji obsługującej zmiany zawartości
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
            // Rerender tylko gdy zmienia się ścieżka pliku lub język
            // Zawartość pliku (content) celowo ignorujemy
            return (
                prevProps.file.path === nextProps.file.path &&
                prevProps.language === nextProps.language
            );
        }
    );

    // Sprawdzamy, czy bieżący plik jest obrazem
    const isCurrentFileImage = currentFile && isImageFile(currentFile.path);

    // Funkcja do konwersji ścieżki pliku na URL dla webview
    const getImageSrc = (filePath: string) => {
        try {
            return convertFileSrc(filePath);
        } catch (error) {
            console.error('Error converting file path to URL:', error);
            return `file://${filePath}`; // Fallback
        }
    };

    return (
        <ThemeProvider forceDarkMode={true}>
            <SidebarProvider>
                <AppSidebar variant="inset"/>
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {currentFile ? (
                                    <>
                                        {/* Wyświetl uproszczone breadcrumbs */}
                                        {breadcrumbs.map((segment, index, array) => (
                                            index === array.length - 1 ? (
                                                <BreadcrumbItem key={index}>
                                                    <BreadcrumbPage>{segment}</BreadcrumbPage>
                                                </BreadcrumbItem>
                                            ) : (
                                                <React.Fragment key={index}>
                                                    <BreadcrumbItem className="hidden md:block">
                                                        <BreadcrumbLink href="#">{segment}</BreadcrumbLink>
                                                    </BreadcrumbItem>
                                                    <BreadcrumbSeparator className="hidden md:block" />
                                                </React.Fragment>
                                            )
                                        ))}
                                    </>
                                ) : (
                                    <BreadcrumbItem>
                                        <BreadcrumbPage>No file open</BreadcrumbPage>
                                    </BreadcrumbItem>
                                )}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </header>
                    <div className="flex flex-1 flex-col gap-4 p-4">
                        {currentFile ? (
                            <div key={editorKey} className="h-full w-full">
                                {isCurrentFileImage ? (
                                    // Wyświetl podgląd obrazu dla plików graficznych
                                    <ImageViewer 
                                        src={getImageSrc(currentFile.path)} 
                                        alt={currentFile.name} 
                                    />
                                ) : (
                                    // Wyświetl edytor kodu dla zwykłych plików
                                    <MemoizedCodeEditor
                                        file={currentFile}
                                        onChangeContent={handleContentChange}
                                        language={fileLanguage}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>Open a file to start editing</p>
                            </div>
                        )}
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    );
}

// Główny komponent aplikacji
export default function App() {
    return <AppContent />;
}

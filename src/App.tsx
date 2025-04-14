import React, { useState, useEffect } from "react"
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
import { FileService, FileInfo } from "./lib/file-service"

// Global file service instance
const fileService = new FileService();

export default function App() {
    const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
    const [fileLanguage, setFileLanguage] = useState<string>("typescript");

    // Handle file content changes
    const handleContentChange = (content: string) => {
        if (currentFile) {
            // Update the currentFile content
            setCurrentFile({
                ...currentFile,
                content: content,
            });
        }
    };

    // Function to get language from file extension
    const getLanguageFromExtension = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js': return 'javascript';
            case 'jsx': return 'jsx';
            case 'ts': return 'typescript';
            case 'tsx': return 'tsx';
            case 'html': return 'html';
            case 'css': return 'css';
            case 'json': return 'javascript';
            default: return 'typescript';
        }
    };

    // Listen for file changes from the file service
    useEffect(() => {
        const checkForFileChanges = () => {
            const serviceFile = fileService.getCurrentFile();
            if (serviceFile && (!currentFile || serviceFile.path !== currentFile.path)) {
                setCurrentFile(serviceFile);
                setFileLanguage(getLanguageFromExtension(serviceFile.name));
            }
        };

        // Check immediately
        checkForFileChanges();

        // Set up interval to check regularly
        const interval = setInterval(checkForFileChanges, 1000);
        return () => clearInterval(interval);
    }, [currentFile]);

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
                                        {/* Display path components as breadcrumbs */}
                                        {currentFile.path.split(/[\/\\]/).filter(Boolean).map((part, index, array) => (
                                            index === array.length - 1 ? (
                                                <BreadcrumbItem key={index}>
                                                    <BreadcrumbPage>{part}</BreadcrumbPage>
                                                </BreadcrumbItem>
                                            ) : (
                                                <React.Fragment key={index}>
                                                    <BreadcrumbItem className="hidden md:block">
                                                        <BreadcrumbLink href="#">{part}</BreadcrumbLink>
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
                        <CodeEditor 
                            initialValue={currentFile?.content || ""}
                            onChange={handleContentChange}
                            language={fileLanguage as any}
                        />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ThemeProvider>
    )
}

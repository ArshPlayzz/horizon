import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { ChevronRight, File, FolderOpen, Save, Download, FileUp, Search, X } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,

  SidebarRail,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DirectoryItem } from "@/lib/file-service"
import { useFileContext } from "@/lib/file-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "./ui/scroll-area"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Używamy kontekstu zamiast bezpośredniego dostępu do FileService
  const { 
    openFile, 
    openDirectory, 
    openFileFromPath, 
    saveFile, 
    saveFileAs, 
    directoryStructure, 
    currentDirectory,
    activeFilePath,
    searchFiles,
    searchFileContents,
    currentFile
  } = useFileContext();
  
  // Stan lokalny dla wyszukiwania
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<DirectoryItem[]>([]);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Zoptymalizowana funkcja do wyszukiwania plików z debounce
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Clear previous debounce timeout
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }

    setIsSearchMode(true);
    
    // Debounce search to prevent excessive API calls
    searchDebounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300); // 300ms debounce delay
  };

  // Separate function to perform the actual search
  const performSearch = async (query: string) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    
    try {
      // Przeszukaj zarówno nazwy plików jak i zawartość
      const fileNameResults = await searchFiles(query);
      const contentResults = await searchFileContents(query);
      
      // Łączymy wyniki i usuwamy duplikaty
      const combinedResults = [...fileNameResults];
      
      // Dodaj wyniki z przeszukiwania zawartości, jeśli nie są już w wynikach z nazw plików
      contentResults.forEach(contentItem => {
        if (!combinedResults.some(item => item.path === contentItem.path)) {
          combinedResults.push(contentItem);
        }
      });
      
      setSearchResults(combinedResults);
    } catch (error) {
      console.error("Błąd podczas wyszukiwania:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Cancel any pending search when component unmounts
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  // Wyczyść wyszukiwanie
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchMode(false);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  };

  const handleOpenFile = async () => {
    await openFile();
  };

  const handleOpenDirectory = async () => {
    await openDirectory();
  };

  const handleSaveFile = async () => {
    if (currentFile) {
      await saveFile(currentFile.content);
    }
  };

  const handleSaveAsFile = async () => {
    if (currentFile) {
      await saveFileAs(currentFile.content);
    }
  };

  const handleFileClick = async (filePath: string) => {
    try {
      console.log(`AppSidebar: Kliknięcie w plik: ${filePath}`);
      const file = await openFileFromPath(filePath);
      console.log(`AppSidebar: Rezultat otwarcia pliku:`, file);
      if (file) {
        console.log(`AppSidebar: Pomyślnie otwarto plik, długość zawartości: ${file.content.length}`);
      } else {
        console.log(`AppSidebar: Nie udało się otworzyć pliku`);
      }
    } catch (error) {
      console.error("Error opening file:", error);
    }
  };

  return (
    <Sidebar {...props}>
      <SidebarContent className="relative w-full h-full">
          <SidebarGroup className="w-full overflow-hidden">
            <div className="flex flex-row justify-start p-1 gap-2 w-full max-w-[18rem]">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleOpenFile}
                title="Open File"
                className="shrink-0"
              >
                <FileUp className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleOpenDirectory}
                title="Open Directory"
                className="shrink-0"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={handleSaveFile}
                      disabled={!currentFile}
                      className="shrink-0"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {currentFile ? "Save" : "No file open to save"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={handleSaveAsFile}
                      disabled={!currentFile}
                      className="shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {currentFile ? "Save As" : "No file open to save"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Pole wyszukiwania */}
            <div className="px-2 py-2 flex max-w-[18rem]">
              <div className="relative flex-1">
                <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <Input
                  className="pl-8 pr-8 text-sm" 
                  placeholder="Search files and content..."
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                />
                {searchQuery && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button 
                      className="flex items-center justify-center" 
                      onClick={clearSearch}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <SidebarGroupLabel>
              {isSearchMode 
                ? `Results (${searchResults.length})` 
                : (currentDirectory ? `Files (${currentDirectory.split('/').pop() || currentDirectory.split('\\').pop()})` : 'Files')}
            </SidebarGroupLabel>
            <SidebarGroupContent className="relative overflow-hidden h-full">
            <ScrollArea className="absolute inset-0 w-full h-full" type="auto" scrollHideDelay={400}>

              <SidebarMenu>
                {directoryStructure ? (
                  isSearchMode ? (
                    // Pokazujemy wyniki wyszukiwania
                    isSearching ? (
                      <div className="px-2 py-4 text-center text-muted-foreground">
                        <p className="text-sm">Searching...</p>
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((item, index) => (
                        <DirectoryTree 
                          key={`search-${index}`} 
                          item={item} 
                          onFileClick={handleFileClick}
                          activeFilePath={activeFilePath} 
                        />
                      ))
                    ) : (
                      <div className="px-2 py-4 text-center text-muted-foreground">
                        <p className="text-sm">No results for"{searchQuery}"</p>
                      </div>
                    )
                  ) : (
                    // Pokazujemy standardową strukturę katalogów
                    directoryStructure.map((item, index) => (
                      <DirectoryTree 
                        key={index} 
                        item={item} 
                        onFileClick={handleFileClick}
                        activeFilePath={activeFilePath} 
                      />
                    ))
                  )
                ) : (
                  // Zamiast przykładowych danych, pokazujemy komunikat
                  <div className="px-2 py-8 text-center text-muted-foreground">
                    <p className="mb-2">No directory opened</p>
                    <p className="text-xs">Click the folder icon above to open a directory</p>
                  </div>
                )}
              </SidebarMenu>
              </ScrollArea>
            </SidebarGroupContent>
          </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

// For real directory structure
function DirectoryTree({ item, onFileClick, activeFilePath }: { 
  item: DirectoryItem, 
  onFileClick: (path: string) => void,
  activeFilePath: string | null
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { loadDirectoryContents } = useFileContext();
  
  const handleClick = () => {
    if (item.isDirectory) {
      setIsExpanded(!isExpanded);
      
      // If directory needs loading and is being expanded, load contents
      if (item.needsLoading && !isExpanded) {
        loadDirectoryContents(item.path, item);
      }
    } else {
      onFileClick(item.path);
    }
  };
  
  // Check if this file is currently active
  const isActive = activeFilePath === item.path;
  
  return (
    <div className="pl-1 max-w-[18rem]">
      <div 
        className={`flex flex-row items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted ${isActive ? 'bg-muted' : ''}`}
        onClick={handleClick}
      >
        {item.isDirectory ? (
          <ChevronRight 
            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <File className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="truncate text-sm">{item.name}</span>
      </div>
      
      {item.isDirectory && isExpanded && item.children && (
        <div className="pl-3">
          {item.children.length > 0 ? (
            item.children.map((child) => (
              <DirectoryTree 
                key={child.path} 
                item={child} 
                onFileClick={onFileClick}
                activeFilePath={activeFilePath}
              />
            ))
          ) : (
            item.needsLoading ? (
              <div className="flex items-center gap-2 py-1 px-2 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1 px-2 text-sm text-muted-foreground">
                Empty directory
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

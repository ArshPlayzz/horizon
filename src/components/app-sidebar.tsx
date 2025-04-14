import * as React from "react"
import { useState, useEffect } from "react"
import { ChevronRight, File, Folder, FolderOpen, Save, Download, FileUp, Search, X, FileText } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarInput,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DirectoryItem } from "@/lib/file-service"
import { useFileContext } from "@/lib/file-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
    searchFileContents
  } = useFileContext();
  
  // Stan lokalny dla wyszukiwania
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<DirectoryItem[]>([]);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [isContentSearchMode, setIsContentSearchMode] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Funkcja do wyszukiwania plików
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }
    
    setIsSearchMode(true);
    setIsSearching(true);
    
    try {
      let results: DirectoryItem[] = [];
      
      // Przeszukaj pliki po nazwie lub zawartości w zależności od trybu
      if (isContentSearchMode) {
        results = await searchFileContents(query);
      } else {
        results = await searchFiles(query);
      }
      
      setSearchResults(results);
    } catch (error) {
      console.error("Błąd podczas wyszukiwania:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Efekt wyzwalający wyszukiwanie po zmianie trybu wyszukiwania
  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
    }
  }, [isContentSearchMode]);

  // Wyczyść wyszukiwanie
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchMode(false);
  };

  // Przełącz między wyszukiwaniem po nazwie i zawartości
  const toggleSearchMode = () => {
    setIsContentSearchMode(prev => !prev);
  };

  const handleOpenFile = async () => {
    await openFile();
  };

  const handleOpenDirectory = async () => {
    await openDirectory();
  };

  const handleSaveFile = async () => {
    const context = useFileContext();
    if (context.currentFile) {
      await saveFile(context.currentFile.content);
    }
  };

  const handleSaveAsFile = async () => {
    const context = useFileContext();
    if (context.currentFile) {
      await saveFileAs(context.currentFile.content);
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
      <SidebarContent>
        <SidebarGroup>
          <div className="flex flex-row justify-between p-1 gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleOpenFile}
              title="Open File"
            >
              <FileUp className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleOpenDirectory}
              title="Open Directory"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSaveFile}
              title="Save"
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSaveAsFile}
              title="Save As"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Pole wyszukiwania */}
          <div className="px-2 py-2">
            <div className="relative">
              <Input
                placeholder={isContentSearchMode ? "Search in content..." : "Search files..."}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pr-16 h-8 text-sm"
              />
              <div className="absolute right-0 top-0 flex h-8">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={toggleSearchMode}
                      >
                        {isContentSearchMode ? <FileText className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isContentSearchMode ? "Szukaj po nazwie pliku" : "Szukaj w zawartości plików"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={clearSearch}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <SidebarGroupLabel>
            {isSearchMode 
              ? `Results (${searchResults.length})` 
              : (currentDirectory ? `Files (${currentDirectory.split('/').pop() || currentDirectory.split('\\').pop()})` : 'Files')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {directoryStructure ? (
                isSearchMode ? (
                  // Pokazujemy wyniki wyszukiwania
                  isSearching ? (
                    <div className="px-2 py-4 text-center text-muted-foreground">
                      <p className="text-sm">Wyszukiwanie...</p>
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
                      <p className="text-sm">Brak wyników dla "{searchQuery}"</p>
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
  const isActive = activeFilePath === item.path;

  if (!item.isDirectory) {
    console.log(`DirectoryTree: Renderowanie pliku: ${item.name}, ścieżka: ${item.path}, aktywny: ${isActive}`);
    
    const handleClick = () => {
      console.log(`DirectoryTree: Kliknięto w plik: ${item.name}, ścieżka: ${item.path}`);
      onFileClick(item.path);
    };
    
    return (
      <SidebarMenuButton
        onClick={handleClick}
        isActive={isActive}
        className="data-[active=true]:bg-accent"
      >
        <File className="shrink-0" />
        <span className="truncate overflow-hidden min-w-0 flex-1">{item.name}</span>
      </SidebarMenuButton>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={false}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform shrink-0" />
            <Folder className="shrink-0" />
            <span className="truncate overflow-hidden min-w-0 flex-1">{item.name}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children && item.children.map((subItem, index) => (
              <DirectoryTree 
                key={index} 
                item={subItem} 
                onFileClick={onFileClick}
                activeFilePath={activeFilePath} 
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

import * as React from "react"
import { useState } from "react"
import { ChevronRight, File, Folder, FolderOpen, Save, Download, FileUp } from "lucide-react"

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
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { DirectoryItem } from "@/lib/file-service"
import { useFileContext } from "@/lib/file-context"

// Remove or comment out sample data
/*
const sampleData = {
  changes: [
    {
      file: "README.md",
      state: "M",
    },
    {
      file: "api/hello/route.ts",
      state: "U",
    },
    {
      file: "app/layout.tsx",
      state: "M",
    },
  ],
  tree: [
    [
      "app",
      [
        "api",
        ["hello", ["route.ts"]],
        "page.tsx",
        "layout.tsx",
        ["blog", ["page.tsx"]],
      ],
    ],
    [
      "components",
      ["ui", "button.tsx", "card.tsx"],
      "header.tsx",
      "footer.tsx",
    ],
    ["lib", ["util.ts"]],
    ["public", "favicon.ico", "vercel.svg"],
    ".eslintrc.json",
    ".gitignore",
    "next.config.js",
    "tailwind.config.js",
    "package.json",
    "README.md",
  ],
}
*/

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
    activeFilePath
  } = useFileContext();

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
          <SidebarGroupLabel>
            {currentDirectory ? `Files (${currentDirectory.split('/').pop() || currentDirectory.split('\\').pop()})` : 'Files'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {directoryStructure ? (
                // Show actual directory structure when available
                directoryStructure.map((item, index) => (
                  <DirectoryTree 
                    key={index} 
                    item={item} 
                    onFileClick={handleFileClick}
                    activeFilePath={activeFilePath} 
                  />
                ))
              ) : (
                // Instead of sample data, show a message
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

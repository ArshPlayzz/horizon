import * as React from "react"
import { useState, useEffect } from "react"
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
import { FileService, DirectoryItem } from "@/lib/file-service"

// Get the file service instance created in App.tsx (singleton)
// In a real app, we might want to use a context provider to share this instance
const fileService = new FileService();

// Sample data for fallback when no directory is opened
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [directoryStructure, setDirectoryStructure] = useState<DirectoryItem[] | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Effect to keep the active file path in sync with the file service
  useEffect(() => {
    const checkCurrentFile = () => {
      const currentFile = fileService.getCurrentFile();
      if (currentFile) {
        setActiveFilePath(currentFile.path);
      }
    };
    
    // Check on mount
    checkCurrentFile();
    
    // Set up interval
    const interval = setInterval(checkCurrentFile, 500);
    return () => clearInterval(interval);
  }, []);

  const handleOpenFile = async () => {
    const file = await fileService.openFile();
    if (file) {
      setActiveFilePath(file.path);
    }
  };

  const handleOpenDirectory = async () => {
    const dirStructure = await fileService.openDirectory();
    if (dirStructure) {
      setDirectoryStructure(dirStructure);
      setCurrentDirectory(fileService.getCurrentDirectory());
    }
  };

  const handleSaveFile = async () => {
    const currentFile = fileService.getCurrentFile();
    if (currentFile) {
      await fileService.saveFile(currentFile.content);
    }
  };

  const handleSaveAsFile = async () => {
    const currentFile = fileService.getCurrentFile();
    if (currentFile) {
      await fileService.saveFile(currentFile.content, true);
    }
  };

  const handleFileClick = async (filePath: string) => {
    try {
      const file = await fileService.openFileFromPath(filePath);
      if (file) {
        setActiveFilePath(file.path);
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
                // Show sample data when no directory is opened
                sampleData.tree.map((item, index) => (
                  <Tree key={index} item={item} />
                ))
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
    return (
      <SidebarMenuButton
        onClick={() => onFileClick(item.path)}
        isActive={isActive}
        className="data-[active=true]:bg-accent"
      >
        <File />
        {item.name}
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
            <ChevronRight className="transition-transform" />
            <Folder />
            {item.name}
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

// For sample data
function Tree({ item }: { item: string | any[] }) {
  const [name, ...items] = Array.isArray(item) ? item : [item]

  if (!items.length) {
    return (
      <SidebarMenuButton
        isActive={name === "button.tsx"}
        className="data-[active=true]:bg-transparent"
      >
        <File />
        {name}
      </SidebarMenuButton>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={name === "components" || name === "ui"}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {name}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((subItem, index) => (
              <Tree key={index} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

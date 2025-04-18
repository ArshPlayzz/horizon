import { createContext, useState, useContext, ReactNode } from 'react';
import { FileService, FileInfo, DirectoryItem } from './file-service';

interface FileContextType {
  fileService: FileService;
  currentFile: FileInfo | null;
  openFiles: FileInfo[];
  directoryStructure: DirectoryItem[] | null;
  currentDirectory: string | null;
  activeFilePath: string | null;
  setActiveFilePath: (path: string | null) => void;
  setCurrentFile: (file: FileInfo | null) => void;
  setCurrentDirectory: (path: string | null) => void;
  openFile: () => Promise<FileInfo | null>;
  openFileFromPath: (path: string) => Promise<FileInfo | null>;
  openDirectory: () => Promise<DirectoryItem[] | null>;
  saveFile: (content: string) => Promise<FileInfo | null>;
  saveFileAs: (content: string) => Promise<FileInfo | null>;
  updateFileContent: (content: string) => void;
  searchFiles: (query: string) => Promise<DirectoryItem[]>;
  searchFileContents: (query: string) => Promise<DirectoryItem[]>;
  isImageFile: (filePath: string) => boolean;
  loadDirectoryContents: (dirPath: string, item: DirectoryItem) => Promise<void>;
  closeFile: (filePath: string) => void;
  switchToFile: (filePath: string) => void;
  handleRename: (path: string) => Promise<void>;
  handleDelete: (path: string) => Promise<void>;
  handleCopyPath: (path: string) => Promise<void>;
  handleCreateFile: (path: string) => Promise<void>;
  handleCreateFolder: (path: string) => Promise<void>;
  isAudioFile: (filePath: string) => boolean;
}

/**
 * Creates the file context
 */
const FileContext = createContext<FileContextType | null>(null);

/**
 * Hook for using the file context
 * @returns The file context
 * @throws Error if used outside of FileContextProvider
 */
export function useFileContext() {
  const context = useContext(FileContext);
  
  if (!context) {
    throw new Error('useFileContext must be used within a FileContextProvider');
  }
  
  return context;
}

/**
 * Provider component for the file context
 * @param children - React children
 * @returns FileContextProvider component
 */
export function FileContextProvider({ children }: { children: ReactNode }) {
  const [fileService] = useState(() => new FileService());
  
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [openFiles, setOpenFiles] = useState<FileInfo[]>([]);
  const [directoryStructure, setDirectoryStructure] = useState<DirectoryItem[] | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  /**
   * Opens a file and returns its content
   * @returns File information or null if failed
   */
  const openFile = async () => {
    try {
      const file = await fileService.openFile();
      
      if (file) {
        updateCurrentFile(file);
      }
      
      return file;
    } catch (error) {
      return null;
    }
  };

  /**
   * Extracts the state update process to a separate function to ensure consistency
   * @param file - File to update
   */
  const updateCurrentFile = (file: FileInfo) => {
    const existingFileIndex = openFiles.findIndex(f => f.path === file.path);
    
    if (existingFileIndex === -1) {
      // If we already have 3 files open, close the newest one
      if (openFiles.length >= 3) {
        const newestFile = openFiles[openFiles.length - 1];
        closeFile(newestFile.path);
      }
      
      // Add the new file to the list of open files
      setOpenFiles(prev => [...prev, file]);
    } else {
      // Update the existing file
      setOpenFiles(prev => {
        const newFiles = [...prev];
        newFiles[existingFileIndex] = file;
        return newFiles;
      });
    }
    
    setCurrentFile(file);
    setActiveFilePath(file.path);
  };

  /**
   * Opens a file from a given path
   * @param path - Path to the file
   * @returns File information or null if failed
   */
  const openFileFromPath = async (path: string) => {
    try {
      const file = await fileService.openFileFromPath(path);
      
      if (file) {
        updateCurrentFile(file);
      }
      
      return file;
    } catch (error) {
      return null;
    }
  };

  /**
   * Closes a file and removes it from the open files list
   * @param filePath - Path to the file to close
   */
  const closeFile = (filePath: string) => {
    setOpenFiles(prev => prev.filter(file => file.path !== filePath));
    
    // If we're closing the currently active file, switch to another one
    if (activeFilePath === filePath) {
      const remainingFiles = openFiles.filter(file => file.path !== filePath);
      if (remainingFiles.length > 0) {
        const lastFile = remainingFiles[remainingFiles.length - 1];
        setCurrentFile(lastFile);
        setActiveFilePath(lastFile.path);
      } else {
        setCurrentFile(null);
        setActiveFilePath(null);
      }
    }
  };

  /**
   * Switches to a different file
   * @param filePath - Path to the file to switch to
   */
  const switchToFile = (filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (file) {
      setCurrentFile(file);
      setActiveFilePath(filePath);
    }
  };

  /**
   * Opens a directory and returns its structure
   * @returns Directory structure or null if failed
   */
  const openDirectory = async () => {
    try {
      const structure = await fileService.openDirectory();
      if (structure) {
        setDirectoryStructure(structure);
        setCurrentDirectory(fileService.getCurrentDirectory());
      }
      return structure;
    } catch (error) {
      return null;
    }
  };

  /**
   * Saves the current file with the given content
   * @param content - Content to save
   * @returns File information or null if failed
   */
  const saveFile = async (content: string) => {
    try {
      const file = await fileService.saveFile(content, false);
      if (file) {
        // Reset the isUnsaved flag after saving
        file.isUnsaved = false;
        setCurrentFile(file);
        setOpenFiles(prev => prev.map(f => 
          f.path === file.path ? { ...f, isUnsaved: false } : f
        ));
      }
      return file;
    } catch (error) {
      return null;
    }
  };

  /**
   * Saves the current file with a new name
   * @param content - Content to save
   * @returns File information or null if failed
   */
  const saveFileAs = async (content: string) => {
    try {
      const file = await fileService.saveFile(content, true);
      if (file) {
        setCurrentFile(file);
      }
      return file;
    } catch (error) {
      return null;
    }
  };

  /**
   * Updates the content of the current file
   * @param content - New content for the file
   */
  const updateFileContent = (content: string) => {
    if (!currentFile) {
      return; // Do nothing if there's no file
    }
    
    // Update the content reference without calling setCurrentFile
    if (currentFile) {
      // Only modify the content property of the currentFile object
      // without creating a new object and without updating React state
      currentFile.content = content;
      currentFile.isUnsaved = true;
      
      // Also update the file in openFiles
      setOpenFiles(prev => prev.map(file => 
        file.path === currentFile.path ? { ...file, content, isUnsaved: true } : file
      ));
    }
  };

  /**
   * Searches for files by name
   * @param query - Search query
   * @returns Array of directory items matching the query
   */
  const searchFiles = async (query: string): Promise<DirectoryItem[]> => {
    if (!directoryStructure || !query.trim()) {
      return [];
    }
    
    const results: DirectoryItem[] = [];
    const searchInTree = (items: DirectoryItem[]) => {
      items.forEach(item => {
        // Check if the file name matches the query
        if (item.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(item);
        }
        
        // Recursively search the subtree
        if (item.isDirectory && item.children) {
          searchInTree(item.children);
        }
      });
    };
    
    searchInTree(directoryStructure);
    return results;
  };
  
  /**
   * Searches for files by content
   * @param query - Search query
   * @returns Array of directory items matching the query
   */
  const searchFileContents = async (query: string): Promise<DirectoryItem[]> => {
    try {
      return await fileService.searchFileContents(query);
    } catch (error) {
      return [];
    }
  };

  /**
   * Lazily loads directory contents
   * @param dirPath - Path to the directory
   * @param item - Directory item to update
   */
  const loadDirectoryContents = async (dirPath: string, item: DirectoryItem) => {
    try {
      const contents = await fileService.loadDirectoryContents(dirPath);
      
      // Recursively update the directory structure
      const updateDirectoryStructure = (items: DirectoryItem[] | null): DirectoryItem[] | null => {
        if (!items) return null;
        
        return items.map(dirItem => {
          if (dirItem.path === item.path) {
            return {
              ...dirItem,
              children: contents,
              needsLoading: false
            } as DirectoryItem;
          } else if (dirItem.isDirectory && dirItem.children) {
            return {
              ...dirItem,
              children: updateDirectoryStructure(dirItem.children) || undefined
            } as DirectoryItem;
          }
          return dirItem;
        });
      };
      
      // Update the directory structure state
      setDirectoryStructure(prev => updateDirectoryStructure(prev));
    } catch (error) {
    }
  };

  /**
   * Checks if a file is an image
   * @param filePath - Path to the file
   * @returns Whether the file is an image
   */
  const isImageFile = (filePath: string): boolean => {
    return fileService.isImageFile(filePath);
  };

  /**
   * Checks if a file is an audio
   * @param filePath - Path to the file
   * @returns Whether the file is an audio
   */
  const isAudioFile = (filePath: string): boolean => {
    return fileService.isAudioFile(filePath);
  };

  /**
   * Handles renaming a file or directory
   * @param path - Path to the file or directory
   */
  const handleRename = async (_path: string) => {
    // TODO: Implement rename functionality
  };

  /**
   * Handles deleting a file or directory
   * @param path - Path to the file or directory
   */
  const handleDelete = async (_path: string) => {
    // TODO: Implement delete functionality
  };

  /**
   * Copies a file path to the clipboard
   * @param path - Path to copy
   */
  const handleCopyPath = async (path: string) => {
    await navigator.clipboard.writeText(path);
  };

  /**
   * Creates a new file
   * @param path - Path for the new file
   */
  const handleCreateFile = async (_path: string) => {
    // TODO: Implement create file functionality
  };

  /**
   * Creates a new folder
   * @param path - Path for the new folder
   */
  const handleCreateFolder = async (_path: string) => {
    // TODO: Implement create folder functionality
  };

  // Wartość kontekstu
  const value = {
    fileService,
    currentFile,
    openFiles,
    directoryStructure,
    currentDirectory,
    activeFilePath,
    setActiveFilePath,
    setCurrentFile,
    setCurrentDirectory,
    openFile,
    openFileFromPath,
    openDirectory,
    saveFile,
    saveFileAs,
    updateFileContent,
    searchFiles,
    searchFileContents,
    isImageFile,
    loadDirectoryContents,
    closeFile,
    switchToFile,
    handleRename,
    handleDelete,
    handleCopyPath,
    handleCreateFile,
    handleCreateFolder,
    isAudioFile,
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
} 
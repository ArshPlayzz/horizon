import React, { createContext, useContext, ReactNode } from 'react';
import { useFileStore } from './stores';
import { FileInfo, DirectoryItem } from './file-service';

interface FileContextType {
  currentFile: FileInfo | null;
  openFiles: FileInfo[];
  directoryStructure: DirectoryItem[] | undefined;
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
  isAudioFile: (filePath: string) => boolean;
  loadDirectoryContents: (dirPath: string, item: DirectoryItem) => Promise<void>;
  closeFile: (filePath: string) => void;
  switchToFile: (filePath: string) => void;
  handleRename: (path: string) => Promise<void>;
  handleDelete: (path: string) => Promise<void>;
  handleCopyPath: (path: string) => Promise<void>;
  handleCreateFile: (path: string) => Promise<void>;
  handleCreateFolder: (path: string) => Promise<void>;
  setDirectoryStructure: (structure: DirectoryItem[] | undefined) => void;
}

const FileContext = createContext<FileContextType | null>(null);

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
};

interface FileProviderProps {
  children: ReactNode;
}

export const FileContextProvider: React.FC<FileProviderProps> = ({ children }) => {
  const fileStore = useFileStore();

  return (
    <FileContext.Provider value={fileStore}>
      {children}
    </FileContext.Provider>
  );
}; 
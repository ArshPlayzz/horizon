import { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { FileService, FileInfo, DirectoryItem } from './file-service';

// Interfejs dla kontekstu
interface FileContextType {
  fileService: FileService;
  currentFile: FileInfo | null;
  directoryStructure: DirectoryItem[] | null;
  currentDirectory: string | null;
  activeFilePath: string | null;
  setActiveFilePath: (path: string | null) => void;
  setCurrentFile: (file: FileInfo | null) => void;
  openFile: () => Promise<FileInfo | null>;
  openFileFromPath: (path: string) => Promise<FileInfo | null>;
  openDirectory: () => Promise<DirectoryItem[] | null>;
  saveFile: (content: string) => Promise<FileInfo | null>;
  saveFileAs: (content: string) => Promise<FileInfo | null>;
  updateFileContent: (content: string) => void;
}

// Tworzymy kontekst
const FileContext = createContext<FileContextType | null>(null);

// Hook do używania kontekstu
export function useFileContext() {
  const context = useContext(FileContext);
  
  if (!context) {
    throw new Error('useFileContext must be used within a FileContextProvider');
  }
  
  return context;
}

// Provider komponent
export function FileContextProvider({ children }: { children: ReactNode }) {
  // Tworzymy jedną instancję FileService
  const [fileService] = useState(() => new FileService());
  
  // Stany
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [directoryStructure, setDirectoryStructure] = useState<DirectoryItem[] | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Metody dla operacji na plikach
  const openFile = async () => {
    try {
      console.log(`FileContext: Otwieranie pliku przez dialog`);
      const file = await fileService.openFile();
      console.log(`FileContext: Rezultat operacji fileService.openFile:`, file);
      
      if (file) {
        console.log(`FileContext: Plik odczytany, aktualizuję stan`);
        updateCurrentFile(file);
      }
      
      return file;
    } catch (error) {
      console.error('Error opening file:', error);
      return null;
    }
  };

  // Wyciągam proces aktualizacji stanu do osobnej funkcji, aby zapewnić spójność
  const updateCurrentFile = (file: FileInfo) => {
    console.log(`FileContext: updateCurrentFile, plik: ${file.name}, długość: ${file.content.length}`);
    setCurrentFile(file);
    setActiveFilePath(file.path);
  };

  const openFileFromPath = async (path: string) => {
    try {
      console.log(`FileContext: Otwieranie pliku z ścieżki: ${path}`);
      const file = await fileService.openFileFromPath(path);
      console.log(`FileContext: Rezultat operacji FileService:`, file);
      
      if (file) {
        console.log(`FileContext: Plik odczytany, aktualizuję stan`);
        // Używam wspólnej funkcji do aktualizacji stanu
        updateCurrentFile(file);
        
        // Wymuszam re-render - kluczowe dla odświeżenia widoku
        setTimeout(() => {
          console.log(`FileContext: Sprawdzam stan po aktualizacji, currentFile:`, currentFile);
          console.log(`FileContext: activeFilePath:`, activeFilePath);
        }, 0);
      }
      
      return file;
    } catch (error) {
      console.error('Error opening file from path:', error);
      return null;
    }
  };

  const openDirectory = async () => {
    try {
      const structure = await fileService.openDirectory();
      if (structure) {
        setDirectoryStructure(structure);
        setCurrentDirectory(fileService.getCurrentDirectory());
      }
      return structure;
    } catch (error) {
      console.error('Error opening directory:', error);
      return null;
    }
  };

  const saveFile = async (content: string) => {
    try {
      const file = await fileService.saveFile(content, false);
      if (file) {
        setCurrentFile(file);
      }
      return file;
    } catch (error) {
      console.error('Error saving file:', error);
      return null;
    }
  };

  const saveFileAs = async (content: string) => {
    try {
      const file = await fileService.saveFile(content, true);
      if (file) {
        setCurrentFile(file);
      }
      return file;
    } catch (error) {
      console.error('Error saving file as:', error);
      return null;
    }
  };

  const updateFileContent = (content: string) => {
    console.log(`FileContext: updateFileContent, długość zawartości: ${content.length}`);
    if (currentFile) {
      console.log(`FileContext: Aktualizuję zawartość dla pliku: ${currentFile.name}`);
      setCurrentFile({
        ...currentFile,
        content: content
      });
    } else {
      console.log(`FileContext: Brak aktualnego pliku, nie można zaktualizować zawartości`);
    }
  };

  // Wartość kontekstu
  const value = {
    fileService,
    currentFile,
    directoryStructure,
    currentDirectory,
    activeFilePath,
    setActiveFilePath,
    setCurrentFile,
    openFile,
    openFileFromPath,
    openDirectory,
    saveFile,
    saveFileAs,
    updateFileContent
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
} 
import { createContext, useState, useContext, ReactNode } from 'react';
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
  searchFiles: (query: string) => Promise<DirectoryItem[]>;
  searchFileContents: (query: string) => Promise<DirectoryItem[]>;
  isImageFile: (filePath: string) => boolean;
  loadDirectoryContents: (dirPath: string, item: DirectoryItem) => Promise<void>;
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
    if (!currentFile) {
      return; // Nic nie rób jeśli nie ma pliku
    }
    
    // To jest kluczowa zmiana - zamiast aktualizować stan React,
    // który powoduje ponowne renderowanie, tylko aktualizujemy
    // referencję do zawartości pliku
    
    // Aktualizujemy referencję do zawartości bez wywoływania setCurrentFile
    if (currentFile) {
      // Tylko modyfikujemy właściwość content obiektu currentFile
      // bez tworzenia nowego obiektu i bez aktualizacji stanu React
      currentFile.content = content;
    }
    
    // NIE wywołujemy setCurrentFile przy każdej zmianie zawartości!
    // To powodowało problemy z utratą fokusu i resetem kursora
    
    // Opcjonalnie możemy ustawić flagę, że plik został zmodyfikowany
    // ale bez wywołania pełnego re-renderowania
  };

  // Funkcja do wyszukiwania plików po nazwie
  const searchFiles = async (query: string): Promise<DirectoryItem[]> => {
    if (!directoryStructure || !query.trim()) {
      return [];
    }
    
    const results: DirectoryItem[] = [];
    const searchInTree = (items: DirectoryItem[]) => {
      items.forEach(item => {
        // Sprawdź, czy nazwa pliku pasuje do zapytania
        if (item.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(item);
        }
        
        // Rekurencyjnie przeszukaj poddrzewo
        if (item.isDirectory && item.children) {
          searchInTree(item.children);
        }
      });
    };
    
    searchInTree(directoryStructure);
    return results;
  };
  
  // Funkcja do wyszukiwania plików po zawartości
  const searchFileContents = async (query: string): Promise<DirectoryItem[]> => {
    try {
      return await fileService.searchFileContents(query);
    } catch (error) {
      console.error('Error searching file contents:', error);
      return [];
    }
  };

  // Function to lazily load directory contents
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
      console.error('Error loading directory contents:', error);
    }
  };

  // Wrapper dla metody isImageFile z FileService
  const isImageFile = (filePath: string): boolean => {
    return fileService.isImageFile(filePath);
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
    updateFileContent,
    searchFiles,
    searchFileContents,
    isImageFile,
    loadDirectoryContents
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
} 
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface FileInfo {
  path: string;
  name: string;
  content: string;
}

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  type: 'file' | 'directory';
  children?: DirectoryItem[];
  needsLoading?: boolean;
}

// Singleton pattern
let fileServiceInstance: FileService | null = null;

export class FileService {
  private currentFile: FileInfo | null = null;
  private currentDirectory: string | null = null;
  private directoryStructure: DirectoryItem[] | null = null;
  private fileContentIndex: Map<string, string> = new Map(); // Cache for file contents
  private fileSearchIndex: Map<string, Set<string>> = new Map(); // Index for search terms
  private indexingInProgress: boolean = false;

  constructor() {
    // Sprawdz czy juz istnieje instancja
    if (fileServiceInstance) {
      return fileServiceInstance;
    }
    fileServiceInstance = this;
  }

  // Metoda do pobierania instancji singletona
  static getInstance(): FileService {
    if (!fileServiceInstance) {
      fileServiceInstance = new FileService();
    }
    return fileServiceInstance;
  }

  /**
   * Otwiera plik i zwraca jego zawartość
   */
  async openFile(): Promise<FileInfo | null> {
    try {
      // Otwórz dialog wyboru pliku
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      // Jeśli użytkownik anulował wybór, zwróć null
      if (!selected) {
        console.log("FileService: Użytkownik anulował wybór pliku");
        return null;
      }

      const filePath = selected as string;
      console.log(`FileService: Wybrano plik: ${filePath}`);
      
      // Odczytaj zawartość pliku
      const content = await readTextFile(filePath);
      console.log(`FileService: Zawartość pliku (pierwsze 50 znaków): ${content.substring(0, 50)}...`);
      
      // Pobierz nazwę pliku z ścieżki
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      // Zapisz informacje o bieżącym pliku
      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };
      console.log(`FileService: Zaktualizowano currentFile: ${fileName}, długość zawartości: ${content.length}`);

      return this.currentFile;
    } catch (error) {
      console.error('Błąd podczas otwierania pliku:', error);
      throw error;
    }
  }

  /**
   * Otwiera folder projektu i skanuje jego strukturę
   */
  async openDirectory(): Promise<DirectoryItem[] | null> {
    try {
      // Otwórz dialog wyboru folderu
      const selected = await open({
        directory: true,
        multiple: false
      });

      // Jeśli użytkownik anulował wybór, zwróć null
      if (!selected) {
        return null;
      }

      const dirPath = selected as string;
      this.currentDirectory = dirPath;
      
      // Clear indexes when opening a new directory
      this.fileContentIndex.clear();
      this.fileSearchIndex.clear();
      
      // Skanuj strukturę folderu
      this.directoryStructure = await this.scanDirectory(dirPath);
      
      // Start background indexing
      setTimeout(() => this.indexDirectoryContents(), 1000);
      
      return this.directoryStructure;
    } catch (error) {
      console.error('Błąd podczas otwierania folderu:', error);
      throw error;
    }
  }

  /**
   * Rekurencyjnie skanuje strukturę folderu
   */
  private async scanDirectory(dirPath: string, depth: number = 0): Promise<DirectoryItem[]> {
    try {
      const entries = await readDir(dirPath);
      const result: DirectoryItem[] = [];

      // Limit recursion depth for initial loading
      const maxInitialDepth = 2;

      for (const entry of entries) {
        // Konstruujemy ścieżkę używając funkcji join, która obsługuje różne systemy operacyjne
        const entryPath = await join(dirPath, entry.name);
        
        const item: DirectoryItem = {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory,
          type: entry.isDirectory ? 'directory' : 'file'
        };

        if (item.isDirectory) {
          // For directories, only scan children if within the initial depth limit
          if (depth < maxInitialDepth) {
            item.children = await this.scanDirectory(item.path, depth + 1);
          } else {
            // Mark directories that need lazy loading
            item.children = [];
            item.needsLoading = true;
          }
        }

        result.push(item);
      }

      // Sortuj - najpierw foldery, potem pliki, alfabetycznie
      return result.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error(`Błąd podczas skanowania folderu ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Lazily loads the contents of a directory when needed
   */
  async loadDirectoryContents(dirPath: string): Promise<DirectoryItem[]> {
    try {
      return await this.scanDirectory(dirPath, 0);
    } catch (error) {
      console.error(`Error loading directory contents for ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Otwiera plik z określonej ścieżki
   */
  async openFileFromPath(filePath: string): Promise<FileInfo | null> {
    try {
      console.log(`FileService: Otwieranie pliku z ścieżki: ${filePath}`);
      
      // Odczytaj zawartość pliku
      const content = await readTextFile(filePath);
      console.log(`FileService: Zawartość pliku (pierwsze 50 znaków): ${content.substring(0, 50)}...`);
      
      // Pobierz nazwę pliku z ścieżki
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      // Zapisz informacje o bieżącym pliku
      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };
      console.log(`FileService: Zaktualizowano currentFile: ${fileName}, długość zawartości: ${content.length}`);

      return this.currentFile;
    } catch (error) {
      console.error('Błąd podczas otwierania pliku:', error);
      throw error;
    }
  }

  /**
   * Zapisuje zawartość do bieżącego pliku lub otwiera dialog zapisu
   */
  async saveFile(content: string, saveAs: boolean = false): Promise<FileInfo | null> {
    try {
      let filePath: string | null = null;

      // Jeśli zapisujemy jako nowy plik lub nie ma bieżącego pliku
      if (saveAs || !this.currentFile) {
        // Otwórz dialog zapisywania pliku
        const selected = await save({
          filters: [
            { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (!selected) {
          return null; // Użytkownik anulował
        }

        filePath = selected as string;
      } else {
        // Użyj ścieżki bieżącego pliku
        filePath = this.currentFile.path;
      }

      // Zapisz zawartość do pliku
      await writeTextFile(filePath, content);

      // Pobierz nazwę pliku z ścieżki
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      // Zaktualizuj informacje o bieżącym pliku
      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };

      return this.currentFile;
    } catch (error) {
      console.error('Błąd podczas zapisywania pliku:', error);
      throw error;
    }
  }

  /**
   * Zwraca informacje o bieżącym pliku
   */
  getCurrentFile(): FileInfo | null {
    if (this.currentFile) {
      console.log(`FileService: getCurrentFile zwraca: ${this.currentFile.name}, długość zawartości: ${this.currentFile.content.length}`);
    } else {
      console.log('FileService: getCurrentFile zwraca null');
    }
    return this.currentFile;
  }

  /**
   * Zwraca strukturę bieżącego folderu
   */
  getCurrentDirectoryStructure(): DirectoryItem[] | null {
    return this.directoryStructure;
  }

  /**
   * Zwraca ścieżkę do bieżącego folderu
   */
  getCurrentDirectory(): string | null {
    return this.currentDirectory;
  }

  /**
   * Background file indexing for faster search
   */
  private async indexDirectoryContents() {
    if (this.indexingInProgress || !this.directoryStructure || !this.currentDirectory) {
      return;
    }
    
    this.indexingInProgress = true;
    console.log('Starting background file indexing...');
    
    const indexableExtensions = [
      'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'md', 'txt', 
      'py', 'rb', 'php', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'swift'
    ];
    
    // Collect all files to index
    const filesToIndex: string[] = [];
    const collectFiles = (items: DirectoryItem[]) => {
      for (const item of items) {
        if (!item.isDirectory) {
          const fileExt = item.name.split('.').pop()?.toLowerCase();
          if (fileExt && indexableExtensions.includes(fileExt)) {
            filesToIndex.push(item.path);
          }
        } else if (item.children) {
          collectFiles(item.children);
        }
      }
    };
    
    collectFiles(this.directoryStructure);
    
    // Index files in batches to avoid blocking the UI
    const batchSize = 10;
    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize);
      
      // Process each file in the batch
      await Promise.all(batch.map(async (filePath) => {
        try {
          // Skip already indexed files
          if (this.fileContentIndex.has(filePath)) {
            return;
          }
          
          const content = await readTextFile(filePath);
          
          // Store the content in the index
          this.fileContentIndex.set(filePath, content);
          
          // Create search terms index
          const words = content.toLowerCase().split(/\s+/);
          const uniqueWords = new Set(words);
          
          // Add to the search index
          for (const word of uniqueWords) {
            if (word.length > 2) { // Skip very short words
              const existingFiles = this.fileSearchIndex.get(word) || new Set();
              existingFiles.add(filePath);
              this.fileSearchIndex.set(word, existingFiles);
            }
          }
        } catch (error) {
          // Silent fail for indexing, just skip this file
        }
      }));
      
      // Yield to UI thread after each batch
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    this.indexingInProgress = false;
    console.log('File indexing completed!');
  }

  /**
   * Przeszukuje strukturę katalogów w poszukiwaniu plików zawierających podany tekst
   * @param query Tekst do wyszukania w treści plików
   * @param maxResults Maksymalna liczba wyników
   * @returns Tablica elementów pasujących do zapytania
   */
  async searchFileContents(query: string, maxResults: number = 20): Promise<DirectoryItem[]> {
    if (!this.directoryStructure || !this.currentDirectory || !query.trim()) {
      return [];
    }
    
    const results: DirectoryItem[] = [];
    const searchedPaths: Set<string> = new Set(); // To avoid duplicates
    
    // Prepare the search terms
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
    
    // Use the index if we have it
    if (this.fileSearchIndex.size > 0) {
      // Find files that contain all the search terms
      const matchingFiles: string[] = [];
      let isFirstTerm = true;
      let candidateFiles: Set<string> = new Set();
      
      for (const term of searchTerms) {
        const filesWithTerm = this.fileSearchIndex.get(term);
        
        if (!filesWithTerm || filesWithTerm.size === 0) {
          continue; // Skip terms not found in any file
        }
        
        if (isFirstTerm) {
          // For the first term, add all matching files as candidates
          filesWithTerm.forEach(file => candidateFiles.add(file));
          isFirstTerm = false;
        } else {
          // For subsequent terms, only keep files that contain all previous terms
          candidateFiles = new Set(
            Array.from(candidateFiles).filter(file => filesWithTerm.has(file))
          );
        }
        
        // If no candidates left, exit early
        if (candidateFiles.size === 0) {
          break;
        }
      }
      
      // Convert candidate files to result array
      candidateFiles.forEach(filePath => {
        if (matchingFiles.length < maxResults) {
          matchingFiles.push(filePath);
        }
      });
      
      // Convert file paths to DirectoryItem objects
      for (const filePath of matchingFiles) {
        const item = this.findDirectoryItemByPath(filePath, this.directoryStructure);
        if (item) {
          results.push(item);
        }
      }
      
      return results;
    }
    
    // Fallback to legacy search if index is not ready
    const searchInFile = async (filePath: string, item: DirectoryItem): Promise<boolean> => {
      try {
        // Skip if already searched
        if (searchedPaths.has(filePath)) {
          return false;
        }
        searchedPaths.add(filePath);
        
        // Filter file types
        const searchableExtensions = [
          'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'md', 'txt', 
          'py', 'rb', 'php', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'swift'
        ];
        
        const fileExt = item.name.split('.').pop()?.toLowerCase();
        if (!fileExt || !searchableExtensions.includes(fileExt)) {
          return false;
        }
        
        // Use cached content if available
        let content: string;
        if (this.fileContentIndex.has(filePath)) {
          content = this.fileContentIndex.get(filePath)!;
        } else {
          content = await readTextFile(filePath);
          // Cache the content for future searches
          this.fileContentIndex.set(filePath, content);
        }
        
        // Check if file content matches the search terms
        return searchTerms.every(term => 
          content.toLowerCase().includes(term.toLowerCase())
        );
      } catch (error) {
        console.error(`Błąd podczas przeszukiwania pliku ${filePath}:`, error);
        return false;
      }
    };
    
    // Faster search using batch processing
    const searchInTree = async (items: DirectoryItem[]) => {
      const fileBatch: {path: string, item: DirectoryItem}[] = [];
      
      // Collect all files to search in batches
      const collectFiles = (dirItems: DirectoryItem[]) => {
        for (const item of dirItems) {
          if (results.length >= maxResults) break;
          
          if (!item.isDirectory) {
            fileBatch.push({path: item.path, item});
          } else if (item.children) {
            collectFiles(item.children);
          }
        }
      };
      
      collectFiles(items);
      
      // Process files in batches
      const batchSize = 20;
      for (let i = 0; i < fileBatch.length; i += batchSize) {
        if (results.length >= maxResults) break;
        
        const batch = fileBatch.slice(i, i + batchSize);
        
        // Process each file in parallel
        const batchResults = await Promise.all(
          batch.map(async ({path, item}) => {
            if (await searchInFile(path, item)) {
              return item;
            }
            return null;
          })
        );
        
        // Add matching files to results
        for (const item of batchResults) {
          if (item && results.length < maxResults) {
            results.push(item);
          }
        }
        
        // Yield to UI thread after each batch
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };
    
    await searchInTree(this.directoryStructure);
    return results;
  }
  
  /**
   * Find a DirectoryItem by path
   */
  private findDirectoryItemByPath(path: string, items: DirectoryItem[]): DirectoryItem | null {
    for (const item of items) {
      if (item.path === path) {
        return item;
      }
      
      if (item.isDirectory && item.children) {
        const found = this.findDirectoryItemByPath(path, item.children);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
  }

  /**
   * Sprawdza czy plik jest obrazem na podstawie rozszerzenia
   */
  isImageFile(filePath: string): boolean {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    return imageExtensions.includes(extension);
  }
}
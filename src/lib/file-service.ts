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
  children?: DirectoryItem[];
}

// Singleton pattern
let fileServiceInstance: FileService | null = null;

export class FileService {
  private currentFile: FileInfo | null = null;
  private currentDirectory: string | null = null;
  private directoryStructure: DirectoryItem[] | null = null;

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
      
      // Skanuj strukturę folderu
      this.directoryStructure = await this.scanDirectory(dirPath);
      
      return this.directoryStructure;
    } catch (error) {
      console.error('Błąd podczas otwierania folderu:', error);
      throw error;
    }
  }

  /**
   * Rekurencyjnie skanuje strukturę folderu
   */
  private async scanDirectory(dirPath: string): Promise<DirectoryItem[]> {
    try {
      const entries = await readDir(dirPath);
      const result: DirectoryItem[] = [];

      for (const entry of entries) {
        // Konstruujemy ścieżkę używając funkcji join, która obsługuje różne systemy operacyjne
        const entryPath = await join(dirPath, entry.name);
        
        const item: DirectoryItem = {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory
        };

        if (item.isDirectory) {
          // Dla folderów rekurencyjnie skanujemy zawartość
          item.children = await this.scanDirectory(item.path);
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
    const searched: Set<string> = new Set(); // Zapobiega duplikatom
    
    // Funkcja pomocnicza do przeszukiwania zawartości pliku
    const searchInFile = async (filePath: string, item: DirectoryItem): Promise<boolean> => {
      try {
        // Pomijamy pliki binarne i zbyt duże
        // Rozszerzenia plików które warto przeszukać
        const searchableExtensions = [
          'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'md', 'txt', 
          'py', 'rb', 'php', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'swift'
        ];
        
        const fileExt = item.name.split('.').pop()?.toLowerCase();
        if (!fileExt || !searchableExtensions.includes(fileExt)) {
          return false;
        }
        
        // Czytamy zawartość pliku
        const content = await readTextFile(filePath);
        // Sprawdzamy, czy zawartość zawiera wyszukiwane słowo
        return content.toLowerCase().includes(query.toLowerCase());
      } catch (error) {
        console.error(`Błąd podczas przeszukiwania pliku ${filePath}:`, error);
        return false;
      }
    };
    
    // Przeszukuj strukturę katalogów rekurencyjnie
    const searchInTree = async (items: DirectoryItem[]) => {
      for (const item of items) {
        // Jeśli znaleźliśmy wystarczającą liczbę wyników, przerwij wyszukiwanie
        if (results.length >= maxResults) break;
        
        // Unikaj duplikatów
        if (searched.has(item.path)) continue;
        searched.add(item.path);
        
        if (!item.isDirectory) {
          // Sprawdź czy nazwa pliku pasuje do zapytania
          if (item.name.toLowerCase().includes(query.toLowerCase())) {
            results.push(item);
          } 
          // Sprawdź zawartość pliku
          else if (await searchInFile(item.path, item)) {
            results.push(item);
          }
        } else if (item.children) {
          // Rekurencyjnie przeszukaj poddrzewo
          await searchInTree(item.children);
        }
      }
    };
    
    await searchInTree(this.directoryStructure);
    return results;
  }
}
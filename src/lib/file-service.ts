import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface FileInfo {
  path: string;
  name: string;
  content: string;
}

export class FileService {
  private currentFile: FileInfo | null = null;

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
        return null;
      }

      const filePath = selected as string;
      
      // Odczytaj zawartość pliku
      const content = await readTextFile(filePath);
      
      // Pobierz nazwę pliku z ścieżki
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      // Zapisz informacje o bieżącym pliku
      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };

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

        filePath = selected;
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
    return this.currentFile;
  }
} 
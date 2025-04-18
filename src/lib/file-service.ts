import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface FileInfo {
  path: string;
  name: string;
  content: string;
  isUnsaved?: boolean;
}

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  type: 'file' | 'directory';
  children?: DirectoryItem[];
  needsLoading?: boolean;
}

let fileServiceInstance: FileService | null = null;

export class FileService {
  private currentFile: FileInfo | null = null;
  private currentDirectory: string | null = null;
  private directoryStructure: DirectoryItem[] | null = null;
  private fileContentIndex: Map<string, string> = new Map();
  private fileSearchIndex: Map<string, Set<string>> = new Map();
  private indexingInProgress: boolean = false;

  constructor() {
    if (fileServiceInstance) {
      return fileServiceInstance;
    }
    fileServiceInstance = this;
  }

  static getInstance(): FileService {
    if (!fileServiceInstance) {
      fileServiceInstance = new FileService();
    }
    return fileServiceInstance;
  }

  /**
   * Opens a file and returns its content
   */
  async openFile(): Promise<FileInfo | null> {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!selected) {
        return null;
      }

      const filePath = selected as string;
      
      const content = await readTextFile(filePath);
      
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

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
   * Opens a directory and returns its structure
   */
  async openDirectory(): Promise<DirectoryItem[] | null> {
    try {
      // Open folder selection dialog
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (!selected) {
        return null;
      }

      const dirPath = selected as string;
      this.currentDirectory = dirPath;
      
      this.fileContentIndex.clear();
      this.fileSearchIndex.clear();
      
      this.directoryStructure = await this.scanDirectory(dirPath);
      
      setTimeout(() => this.indexDirectoryContents(), 1000);
      
      return this.directoryStructure;
    } catch (error) {
      console.error('Error opening directory:', error);
      throw error;
    }
  }

  /**
   * Scans a directory and returns its structure
   * @param dirPath - Path to the directory to scan
   * @param depth - Current depth in the directory tree
   * @returns Array of directory items
   */
  private async scanDirectory(dirPath: string, depth: number = 0): Promise<DirectoryItem[]> {
    try {
      const entries = await readDir(dirPath);
      const result: DirectoryItem[] = [];

      const maxInitialDepth = 2;

      for (const entry of entries) {
        const entryPath = await join(dirPath, entry.name);
        
        const item: DirectoryItem = {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory,
          type: entry.isDirectory ? 'directory' : 'file'
        };

        if (item.isDirectory) {
          if (depth < maxInitialDepth) {
            item.children = await this.scanDirectory(item.path, depth + 1);
          } else {
            item.children = [];
            item.needsLoading = true;
          }
        }

        result.push(item);
      }

      return result.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Loads the contents of a directory
   * @param dirPath - Path to the directory
   * @returns Array of directory items
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
   * Opens a file from a given path
   * @param filePath - Path to the file
   * @returns File information or null if failed
   */
  async openFileFromPath(filePath: string): Promise<FileInfo | null> {
    try {
            const content = await readTextFile(filePath);
      
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };

      return this.currentFile;
    } catch (error) {
      console.error('Error opening file from path:', error);
      throw error;
    }
  }

  /**
   * Saves a file with the given content
   * @param content - Content to save
   * @param saveAs - Whether to show save dialog even if file exists
   * @returns File information or null if failed
   */
  async saveFile(content: string, saveAs: boolean = false): Promise<FileInfo | null> {
    try {
      let filePath: string | null = null;

      if (saveAs || !this.currentFile) {
        const selected = await save({
          filters: [
            { name: 'Source Code', extensions: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (!selected) {
          return null;
        }

        filePath = selected as string;
      } else {
        filePath = this.currentFile.path;
      }

      await writeTextFile(filePath, content);

      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      this.currentFile = {
        path: filePath,
        name: fileName,
        content
      };

      return this.currentFile;
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * Returns the current file
   * @returns Current file information or null
   */
  getCurrentFile(): FileInfo | null {
    return this.currentFile;
  }

  /**
   * Returns the structure of the current directory
   * @returns Directory structure or null
   */
  getCurrentDirectoryStructure(): DirectoryItem[] | null {
    return this.directoryStructure;
  }

  /**
   * Returns the path to the current directory
   * @returns Current directory path or null
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
    
    const indexableExtensions = [
      'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'md', 'txt', 
      'py', 'rb', 'php', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'swift'
    ];
    
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
    
    const batchSize = 10;
    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (filePath) => {
        try {
          if (this.fileContentIndex.has(filePath)) {
            return;
          }
          
          const content = await readTextFile(filePath);
          this.fileContentIndex.set(filePath, content);
          
          const words = content.toLowerCase().split(/\s+/);
          const uniqueWords = new Set(words);
          
          for (const word of uniqueWords) {
            if (word.length > 2) {
              const existingFiles = this.fileSearchIndex.get(word) || new Set();
              existingFiles.add(filePath);
              this.fileSearchIndex.set(word, existingFiles);
            }
          }
        } catch (error) {
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    this.indexingInProgress = false;
  }

  /**
   * Searches for files containing the given query
   * @param query - Search query
   * @param maxResults - Maximum number of results to return
   * @returns Array of directory items matching the query
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
    
    // Searches for a query in a directory tree
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
   * Finds a directory item by its path
   * @param path - Path to find
   * @param items - Directory items to search
   * @returns Directory item or null if not found
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
   * Checks if a file is an image
   * @param filePath - Path to the file
   * @returns Whether the file is an image
   */
  isImageFile(filePath: string): boolean {
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    return imageExtensions.includes(extension);
  }

  /**
   * Checks if a file is an audio file
   * @param filePath - Path to the file
   * @returns Whether the file is an audio file
   */
  isAudioFile(filePath: string): boolean {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    return audioExtensions.includes(extension);
  }
}
import { create } from 'zustand';
import { FileService, FileInfo, DirectoryItem } from './file-service';

// Audio Store
interface AudioPlayer {
  id: string;
  pause: () => void;
}

interface AudioState {
  activePlayerId: string | null;
  registeredPlayers: Map<string, AudioPlayer>;
  setActivePlayer: (id: string | null) => void;
  registerPlayer: (id: string, pause: () => void) => void;
  unregisterPlayer: (id: string) => void;
  pauseAllExcept: (id: string) => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  activePlayerId: null,
  registeredPlayers: new Map(),

  setActivePlayer: (id) => {
    const { registeredPlayers } = get();
    if (id === null || registeredPlayers.has(id)) {
      set({ activePlayerId: id });
    }
  },

  registerPlayer: (id, pause) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.set(id, { id, pause });
      return { registeredPlayers: newPlayers };
    });
  },

  unregisterPlayer: (id) => {
    set((state) => {
      const newPlayers = new Map(state.registeredPlayers);
      newPlayers.delete(id);
      return {
        registeredPlayers: newPlayers,
        activePlayerId: state.activePlayerId === id ? null : state.activePlayerId
      };
    });
  },

  pauseAllExcept: (id) => {
    const { registeredPlayers } = get();
    registeredPlayers.forEach((player) => {
      if (player.id !== id) {
        player.pause();
      }
    });
  }
}));

// File Store
interface FileState {
  fileService: FileService;
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

export const useFileStore = create<FileState>((set, get) => {
  const fileService = new FileService();

  const updateCurrentFile = (file: FileInfo) => {
    const { openFiles } = get();
    const existingFileIndex = openFiles.findIndex(f => f.path === file.path);
    
    if (existingFileIndex === -1) {
      if (openFiles.length >= 3) {
        const newestFile = openFiles[openFiles.length - 1];
        get().closeFile(newestFile.path);
      }
      set((state) => ({
        openFiles: [...state.openFiles, file],
        currentFile: file,
        activeFilePath: file.path
      }));
    } else {
      set((state) => {
        const newFiles = [...state.openFiles];
        newFiles[existingFileIndex] = file;
        return {
          openFiles: newFiles,
          currentFile: file,
          activeFilePath: file.path
        };
      });
    }
  };

  return {
    fileService,
    currentFile: null,
    openFiles: [],
    directoryStructure: undefined,
    currentDirectory: null,
    activeFilePath: null,

    setActiveFilePath: (path) => set({ activeFilePath: path }),
    setCurrentFile: (file) => set({ currentFile: file }),
    setCurrentDirectory: (path) => set({ currentDirectory: path }),

    openFile: async () => {
      try {
        const file = await fileService.openFile();
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    openFileFromPath: async (path) => {
      try {
        const file = await fileService.openFileFromPath(path);
        if (file) {
          updateCurrentFile(file);
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    openDirectory: async () => {
      try {
        const structure = await fileService.openDirectory();
        if (structure) {
          set({
            directoryStructure: structure,
            currentDirectory: fileService.getCurrentDirectory()
          });
        }
        return structure;
      } catch (error) {
        return null;
      }
    },

    saveFile: async (content) => {
      try {
        const file = await fileService.saveFile(content, false);
        if (file) {
          file.isUnsaved = false;
          set((state) => ({
            currentFile: file,
            openFiles: state.openFiles.map(f =>
              f.path === file.path ? { ...f, isUnsaved: false } : f
            )
          }));
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    saveFileAs: async (content) => {
      try {
        const file = await fileService.saveFile(content, true);
        if (file) {
          set({ currentFile: file });
        }
        return file;
      } catch (error) {
        return null;
      }
    },

    updateFileContent: (content) => {
      const { currentFile } = get();
      if (!currentFile) return;

      currentFile.content = content;
      currentFile.isUnsaved = true;

      set((state) => ({
        openFiles: state.openFiles.map(file =>
          file.path === currentFile.path
            ? { ...file, content, isUnsaved: true }
            : file
        )
      }));
    },

    searchFiles: async (_query) => {
      return [];
    },

    searchFileContents: async (query) => {
      return fileService.searchFileContents(query);
    },

    isImageFile: (filePath) => {
      return fileService.isImageFile(filePath);
    },

    isAudioFile: (filePath) => {
      return fileService.isAudioFile(filePath);
    },

    loadDirectoryContents: async (dirPath, item) => {
      try {
        const contents = await fileService.loadDirectoryContents(dirPath);
        if (contents) {
          set((state) => {
            const updateDirectoryStructure = (
              items: DirectoryItem[] | undefined
            ): DirectoryItem[] | undefined => {
              if (!items) return undefined;

              return items.map((currentItem) => {
                if (currentItem.path === item.path) {
                  return {
                    ...currentItem,
                    children: contents
                  };
                }

                if (currentItem.children) {
                  return {
                    ...currentItem,
                    children: updateDirectoryStructure(currentItem.children)
                  };
                }

                return currentItem;
              });
            };

            return {
              directoryStructure: updateDirectoryStructure(state.directoryStructure)
            };
          });
        }
      } catch (error) {
        console.error('Error loading directory contents:', error);
      }
    },

    closeFile: (filePath) => {
      set((state) => {
        const newOpenFiles = state.openFiles.filter(file => file.path !== filePath);
        const newCurrentFile = state.activeFilePath === filePath
          ? (newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1] : null)
          : state.currentFile;
        const newActiveFilePath = state.activeFilePath === filePath
          ? (newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null)
          : state.activeFilePath;

        return {
          openFiles: newOpenFiles,
          currentFile: newCurrentFile,
          activeFilePath: newActiveFilePath
        };
      });
    },

    switchToFile: (filePath) => {
      set((state) => {
        const file = state.openFiles.find(f => f.path === filePath);
        if (file) {
          return {
            currentFile: file,
            activeFilePath: filePath
          };
        }
        return state;
      });
    },

    handleRename: async (_path) => {
      // TODO: Implement rename functionality
    },

    handleDelete: async (_path) => {
      // TODO: Implement delete functionality
    },

    handleCopyPath: async (_path) => {
      // TODO: Implement copy path functionality
    },

    handleCreateFile: async (_path) => {
      // TODO: Implement create file functionality
    },

    handleCreateFolder: async (_path) => {
      // TODO: Implement create folder functionality
    },

    setDirectoryStructure: (structure) => {
      set({ directoryStructure: structure });
    }
  };
}); 
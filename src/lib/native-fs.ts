/**
 * Native file system operations using Rust backend
 */
import { invoke } from '@tauri-apps/api/core';

/**
 * Directory entry returned from list_directory function
 */
export interface DirEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
}

/**
 * File information structure
 */
export interface FileInfo {
  id: string;
  path: string;
  name: string;
  content: string;
  is_unsaved: boolean;
}

/**
 * Directory item structure
 */
export interface DirectoryItem {
  name: string;
  path: string;
  is_directory: boolean;
  item_type: string;
  children?: DirectoryItem[];
  needs_loading?: boolean;
  isDirectory: boolean;
  type: string;
}

/**
 * Search match result with context information
 */
export interface MatchResult {
  path: string;
  name: string;
  line_number: number;
  preview_text: string;
  is_directory: boolean;
}

/**
 * Create a new directory at the specified path
 * @param path - Path where the directory should be created
 * @returns Promise that resolves when operation completes
 */
export async function createDirectory(path: string): Promise<void> {
  return invoke('create_directory', { path });
}

/**
 * Create a new file with the given content
 * @param path - Path where the file should be created
 * @param content - Content to write to the file
 * @returns Promise that resolves when operation completes
 */
export async function createFile(path: string, content: string): Promise<void> {
  return invoke('create_file', { path, content });
}

/**
 * Read the content of a file
 * @param path - Path of the file to read
 * @returns Promise that resolves to the file content
 */
export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path });
}

/**
 * Delete a file or directory
 * @param path - Path to delete
 * @param recursive - Whether to delete directories recursively
 * @returns Promise that resolves when operation completes
 */
export async function deletePath(path: string, recursive: boolean = true): Promise<void> {
  return invoke('delete_path', { path, recursive });
}

/**
 * Rename a file or directory
 * @param fromPath - Current path
 * @param toPath - New path
 * @returns Promise that resolves when operation completes
 */
export async function renamePath(fromPath: string, toPath: string): Promise<void> {
  return invoke('rename_path', { fromPath, toPath });
}

/**
 * Check if a path exists
 * @param path - Path to check
 * @returns Promise that resolves to true if the path exists, false otherwise
 */
export async function pathExists(path: string): Promise<boolean> {
  return invoke('path_exists', { path });
}

/**
 * Check if a path is a directory
 * @param path - Path to check
 * @returns Promise that resolves to true if the path is a directory, false otherwise
 */
export async function isDirectory(path: string): Promise<boolean> {
  return invoke('is_directory', { path });
}

/**
 * Copy a file
 * @param fromPath - Source path
 * @param toPath - Destination path
 * @returns Promise that resolves when operation completes
 */
export async function copyFile(fromPath: string, toPath: string): Promise<void> {
  return invoke('copy_file', { fromPath, toPath });
}

/**
 * List directory contents
 * @param path - Directory path to list
 * @returns Promise that resolves to an array of directory entries
 */
export async function listDirectory(path: string): Promise<DirEntry[]> {
  return invoke('list_directory', { path });
}

/**
 * Append text to a file
 * @param path - Path of the file
 * @param content - Content to append
 * @returns Promise that resolves when operation completes
 */
export async function appendToFile(path: string, content: string): Promise<void> {
  return invoke('append_to_file', { path, content });
}

/**
 * Write text to a file, overwriting existing content
 * @param path - Path of the file
 * @param content - Content to write
 * @returns Promise that resolves when operation completes
 */
export async function writeToFile(path: string, content: string): Promise<void> {
  console.log(`[native-fs] writeToFile called for path: ${path}`);
  console.log(`[native-fs] Content type: ${typeof content}, length: ${content.length}`);
  console.log(`[native-fs] Content preview: "${content.substring(0, 50)}..."`);
  
  // Extra validation to ensure we're passing a valid string
  if (typeof content !== 'string') {
    console.error(`[native-fs] Invalid content type: ${typeof content}`);
    content = String(content);
    console.log(`[native-fs] Converted content length: ${content.length}`);
  }
  
  // Remove null characters if any
  if (content.includes('\0')) {
    console.warn(`[native-fs] Content contains null characters, cleaning...`);
    content = content.replace(/\0/g, '');
    console.log(`[native-fs] Cleaned content length: ${content.length}`);
  }
  
  return invoke('write_to_file', { path, content });
}

/**
 * Get file information
 * @param path - Path of the file
 * @returns Promise that resolves to file information
 */
export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke('get_file_info', { path });
}

/**
 * Scan a directory recursively
 * @param dirPath - Directory path to scan
 * @param depth - Current depth (default: 0)
 * @param maxDepth - Maximum depth to scan before lazy loading (default: 2)
 * @returns Promise that resolves to directory structure
 */
export async function scanDirectory(dirPath: string, depth: number = 0, maxDepth: number = 2): Promise<DirectoryItem[]> {
  return invoke('scan_directory', { dirPath, depth, maxDepth });
}

/**
 * Check if a file is an image
 * @param path - Path of the file
 * @returns Promise that resolves to true if the file is an image
 */
export async function isImageFile(path: string): Promise<boolean> {
  return invoke('is_image_file', { path });
}

/**
 * Check if a file is an audio file
 * @param path - Path of the file
 * @returns Promise that resolves to true if the file is an audio file
 */
export async function isAudioFile(path: string): Promise<boolean> {
  return invoke('is_audio_file', { path });
}

/**
 * Search file contents
 * @param query - Search query
 * @param dirPath - Directory path to search in
 * @param maxResults - Maximum number of results (default: 20)
 * @returns Promise that resolves to items containing the query
 */
export async function searchFileContents(query: string, dirPath: string, maxResults: number = 20): Promise<DirectoryItem[]> {
  return invoke('search_file_contents', { query, dirPath, maxResults });
}

/**
 * Advanced search for file contents with regex and filtering options
 * @param query - Search query (regex supported)
 * @param dirPath - Directory path to search in
 * @param maxResults - Maximum number of results (default: 20)
 * @param ignoreCase - Whether to ignore case in search (default: true)
 * @param includePatterns - Optional glob patterns to include
 * @param excludePatterns - Optional glob patterns to exclude
 * @returns Promise that resolves to match results with context
 */
export async function searchFileContentsAdvanced(
  query: string, 
  dirPath: string, 
  maxResults: number = 20,
  ignoreCase: boolean = true,
  includePatterns?: string[],
  excludePatterns?: string[]
): Promise<MatchResult[]> {
  return invoke('search_file_contents_advanced', { 
    query, 
    dirPath, 
    maxResults,
    ignoreCase,
    includePatterns,
    excludePatterns
  });
}

/**
 * Search files by name
 * @param query - Search query
 * @param dirPath - Directory path to search in
 * @param maxResults - Maximum number of results (default: 20)
 * @returns Promise that resolves to items matching the query
 */
export async function searchFilesByName(query: string, dirPath: string, maxResults: number = 20): Promise<DirectoryItem[]> {
  return invoke('search_files_by_name', { query, dirPath, maxResults });
}

/**
 * Advanced search for files by name with filtering options
 * @param query - Search query
 * @param dirPath - Directory path to search in
 * @param maxResults - Maximum number of results (default: 20)
 * @param includePatterns - Optional glob patterns to include
 * @param excludePatterns - Optional glob patterns to exclude
 * @returns Promise that resolves to items matching the query
 */
export async function searchFilesByNameAdvanced(
  query: string,
  dirPath: string,
  maxResults: number = 20,
  includePatterns?: string[],
  excludePatterns?: string[]
): Promise<DirectoryItem[]> {
  return invoke('search_files_by_name_advanced', { 
    query, 
    dirPath, 
    maxResults,
    includePatterns,
    excludePatterns
  });
} 
/// File system operations module
use std::fs;
use std::path::Path;
use std::io::Write;
use tauri::command;

/// Create a new directory at the specified path
/// 
/// # Arguments
/// * `path` - The path where the directory should be created
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

/// Create a new file with the given content
/// 
/// # Arguments
/// * `path` - The path where the file should be created
/// * `content` - The content to write to the file
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn create_file(path: String, content: String) -> Result<(), String> {
    let parent = Path::new(&path).parent();
    
    if let Some(parent_path) = parent {
        if !parent_path.exists() {
            fs::create_dir_all(parent_path)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to create file: {}", e))
}

/// Read the content of a file
/// 
/// # Arguments
/// * `path` - The path of the file to read
/// 
/// # Returns
/// The file content or error message
#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Delete a file or directory
/// 
/// # Arguments
/// * `path` - The path to delete
/// * `recursive` - Whether to delete directories recursively
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn delete_path(path: String, recursive: bool) -> Result<(), String> {
    let path_obj = Path::new(&path);
    
    if path_obj.is_dir() {
        if recursive {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to delete directory recursively: {}", e))
        } else {
            fs::remove_dir(&path)
                .map_err(|e| format!("Failed to delete directory: {}", e))
        }
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// Rename a file or directory
/// 
/// # Arguments
/// * `from_path` - The current path
/// * `to_path` - The new path
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn rename_path(from_path: String, to_path: String) -> Result<(), String> {
    fs::rename(&from_path, &to_path)
        .map_err(|e| format!("Failed to rename: {}", e))
}

/// Check if a path exists
/// 
/// # Arguments
/// * `path` - The path to check
/// 
/// # Returns
/// True if the path exists, false otherwise
#[command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Check if a path is a directory
/// 
/// # Arguments
/// * `path` - The path to check
/// 
/// # Returns
/// True if the path is a directory, false otherwise
#[command]
pub fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

/// Copy a file
/// 
/// # Arguments
/// * `from_path` - The source path
/// * `to_path` - The destination path
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn copy_file(from_path: String, to_path: String) -> Result<(), String> {
    let to_parent = Path::new(&to_path).parent();
    
    // Create parent directories if they don't exist
    if let Some(parent_path) = to_parent {
        if !parent_path.exists() {
            fs::create_dir_all(parent_path)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    
    fs::copy(&from_path, &to_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    
    Ok(())
}

/// List directory contents
/// 
/// # Arguments
/// * `path` - The directory path to list
/// 
/// # Returns
/// A list of path entries or error message
#[command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut result = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let is_dir = metadata.is_dir();
        
        result.push(DirEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: is_dir,
            size: if is_dir { 0 } else { metadata.len() }
        });
    }
    
    Ok(result)
}

/// Directory entry structure
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
    size: u64
}

/// Append text to a file
/// 
/// # Arguments
/// * `path` - The path of the file
/// * `content` - The content to append
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file for appending: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))
}

/// Write text to a file, overwriting existing content
/// 
/// # Arguments
/// * `path` - The path of the file
/// * `content` - The content to write
/// 
/// # Returns
/// Result indicating success or error message
#[command]
pub fn write_to_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write to file: {}", e))
}

/// Get file information
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// FileInfo or error message
#[command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    Ok(FileInfo {
        path,
        name,
        content,
        is_unsaved: false,
    })
}

/// File information structure
#[derive(serde::Serialize, serde::Deserialize)]
pub struct FileInfo {
    path: String,
    name: String,
    content: String,
    is_unsaved: bool,
}

/// Directory item structure
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DirectoryItem {
    name: String,
    path: String,
    is_directory: bool,
    item_type: String,
    children: Option<Vec<DirectoryItem>>,
    needs_loading: Option<bool>,
}

/// Scan a directory recursively up to a certain depth
/// 
/// # Arguments
/// * `dir_path` - The directory path to scan
/// * `depth` - Current depth in the directory tree
/// * `max_depth` - Maximum depth to scan before marking directories for lazy loading
/// 
/// # Returns
/// A vector of DirectoryItems or error message
#[command]
pub fn scan_directory(dir_path: String, depth: u32, max_depth: u32) -> Result<Vec<DirectoryItem>, String> {
    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut items = Vec::new();
    
    for entry_result in entries {
        let entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        
        let is_directory = metadata.is_dir();
        let item_type = if is_directory { "directory".to_string() } else { "file".to_string() };
        
        let mut item = DirectoryItem {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory,
            item_type,
            children: Some(Vec::new()),
            needs_loading: None,
        };
        
        if is_directory {
            if depth < max_depth {
                // Continue scanning subdirectories within depth limit
                let children = scan_directory(item.path.clone(), depth + 1, max_depth)
                    .unwrap_or_else(|_| Vec::new());
                item.children = Some(children);
            } else {
                // Mark for lazy loading when depth limit is reached
                item.needs_loading = Some(true);
            }
        } else {
            item.children = None;
        }
        
        items.push(item);
    }
    
    // Sort: directories first, then alphabetically
    items.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(items)
}

/// Check if a file is an image
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// True if the file is an image, false otherwise
#[command]
pub fn is_image_file(path: String) -> bool {
    let extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
    let path_lower = path.to_lowercase();
    
    extensions.iter().any(|ext| path_lower.ends_with(ext))
}

/// Check if a file is an audio file
/// 
/// # Arguments
/// * `path` - The path of the file
/// 
/// # Returns
/// True if the file is an audio file, false otherwise
#[command]
pub fn is_audio_file(path: String) -> bool {
    let extensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
    let path_lower = path.to_lowercase();
    
    extensions.iter().any(|ext| path_lower.ends_with(ext))
}

/// Search file contents
/// 
/// # Arguments
/// * `query` - The search query
/// * `dir_path` - The directory path to search in
/// * `max_results` - Maximum number of results to return
/// 
/// # Returns
/// A vector of items containing the search query
#[command]
pub fn search_file_contents(query: String, dir_path: String, max_results: u32) -> Result<Vec<DirectoryItem>, String> {
    if query.is_empty() || dir_path.is_empty() {
        return Ok(Vec::new());
    }
    
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    let mut results_count = 0;
    
    // Get the directory structure first
    let items = scan_directory(dir_path, 0, 1)?;
    
    // Search through the structure recursively
    search_in_items(&items, &query_lower, &mut results, &mut results_count, max_results)?;
    
    Ok(results)
}

/// Helper function to search file contents recursively
fn search_in_items(
    items: &[DirectoryItem], 
    query: &str, 
    results: &mut Vec<DirectoryItem>,
    results_count: &mut u32,
    max_results: u32
) -> Result<(), String> {
    if *results_count >= max_results {
        return Ok(());
    }
    
    for item in items {
        if *results_count >= max_results {
            break;
        }
        
        if !item.is_directory {
            // Skip binary files, large files, and system files
            if should_skip_file(&item.path) {
                continue;
            }
            
            // Read and search the file
            match fs::read_to_string(&item.path) {
                Ok(content) => {
                    if content.to_lowercase().contains(query) {
                        results.push(item.clone());
                        *results_count += 1;
                    }
                },
                Err(_) => {
                    // Skip files that can't be read as text
                    continue;
                }
            }
        } else if let Some(children) = &item.children {
            // Recursively search subdirectories
            search_in_items(children, query, results, results_count, max_results)?;
        }
    }
    
    Ok(())
}

/// Helper function to determine if a file should be skipped during search
fn should_skip_file(path: &str) -> bool {
    // Skip based on extension
    let skip_extensions = [
        ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", 
        ".avi", ".mov", ".pdf"
    ];
    
    let path_lower = path.to_lowercase();
    for ext in skip_extensions.iter() {
        if path_lower.ends_with(ext) {
            return true;
        }
    }
    
    // Skip based on file size
    match fs::metadata(path) {
        Ok(metadata) => {
            // Skip files larger than 1MB
            if metadata.len() > 1024 * 1024 {
                return true;
            }
        },
        Err(_) => return true, // Skip if we can't get metadata
    }
    
    false
}

/// Search files by name
/// 
/// # Arguments
/// * `query` - The search query
/// * `dir_path` - The directory path to search in
/// * `max_results` - Maximum number of results to return
/// 
/// # Returns
/// A vector of items matching the query
#[command]
pub fn search_files_by_name(query: String, dir_path: String, max_results: u32) -> Result<Vec<DirectoryItem>, String> {
    if query.is_empty() || dir_path.is_empty() {
        return Ok(Vec::new());
    }
    
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    let mut results_count = 0;
    
    // Get the directory structure first
    let items = scan_directory(dir_path, 0, 10)?; // Scan deeper for better results
    
    // Search through the structure recursively
    search_files_by_name_in_items(&items, &query_lower, &mut results, &mut results_count, max_results)?;
    
    Ok(results)
}

/// Helper function to search files by name recursively
fn search_files_by_name_in_items(
    items: &[DirectoryItem], 
    query: &str, 
    results: &mut Vec<DirectoryItem>,
    results_count: &mut u32,
    max_results: u32
) -> Result<(), String> {
    if *results_count >= max_results {
        return Ok(());
    }
    
    for item in items {
        if *results_count >= max_results {
            break;
        }
        
        // Check if the name of the item contains the query
        if item.name.to_lowercase().contains(query) {
            results.push(item.clone());
            *results_count += 1;
        }
        
        // Continue searching in subdirectories
        if item.is_directory {
            if let Some(children) = &item.children {
                search_files_by_name_in_items(children, query, results, results_count, max_results)?;
            }
        }
    }
    
    Ok(())
} 
pub mod server_factory;
pub mod protocol;
pub mod servers;
pub mod config;
pub mod websocket;

use std::thread;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{RwLock, OnceLock};
use std::collections::HashMap;
use tower_lsp::LspService;
use tower_lsp::Server;
use anyhow::Result;

use server_factory::ServerFactory;
use websocket::WebSocketManager;

// Globalne instancje
static WS_SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static mut WS_MANAGER: Option<WebSocketManager> = None;
// Thread-safe container for active LSP servers
static ACTIVE_SERVERS: OnceLock<RwLock<HashMap<String, bool>>> = OnceLock::new();

/// Get the active servers map, initializing it if needed
fn get_active_servers() -> &'static RwLock<HashMap<String, bool>> {
    ACTIVE_SERVERS.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Zwraca listę aktualnie obsługiwanych języków przez serwery LSP
pub fn get_supported_languages() -> Vec<&'static str> {
    vec!["rust"] // Aktualizuj tę listę w miarę dodawania nowych serwerów
}

/// Zwraca listę języków z identyfikowanymi plikami projektu
/// Te języki mogą nie mieć pełnego wsparcia LSP, ale system potrafi je rozpoznać
pub fn get_recognized_languages() -> Vec<&'static str> {
    vec!["rust", "javascript", "typescript", "python"]
}

/// Initialize and start the LSP server for a specific language
pub async fn start_language_server(language: String, file_path: String) -> Result<()> {
    let server_factory = ServerFactory::new();
    
    // Utwórz instancję serwera języka przekazując ścieżkę pliku
    // ServerFactory znajdzie odpowiedni katalog główny projektu
    let server = server_factory.create_language_server_instance(&language, &file_path)?;
    
    let (service, socket) = LspService::new(|client| server.with_client(client));
    Server::new(tokio::io::stdin(), tokio::io::stdout(), socket).serve(service).await;
    
    Ok(())
}

/// Tauri command to start an LSP server for a language
#[tauri::command]
pub async fn start_lsp_server(language: String, file_path: String) -> Result<String, String> {
    let _server_factory = ServerFactory::new();
    
    // Sprawdź czy to faktycznie plik, a nie katalog
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Podana ścieżka nie istnieje: {}", file_path));
    }
    
    println!("Próba uruchomienia serwera LSP dla języka: {}, ścieżka: {}", language, file_path);
    
    // Normalizuj język do małych liter
    let mut normalized_language = language.to_lowercase();
    
    // Jeśli język jest nieznany, spróbuj wykryć go z rozszerzenia pliku
    if normalized_language == "unknown" || normalized_language.is_empty() {
        // Wykryj język na podstawie rozszerzenia pliku
        if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
            normalized_language = match extension {
                "rs" => "rust".to_string(),
                "py" => "python".to_string(),
                "js" => "javascript".to_string(),
                "ts" => "typescript".to_string(),
                _ => normalized_language
            };
            println!("Automatycznie wykryto język: {} na podstawie rozszerzenia pliku", normalized_language);
        }
    }
    
    // Najpierw sprawdź, czy język jest obsługiwany, aby nie tworzyć wątku niepotrzebnie
    let supported_languages = get_supported_languages();
    
    if !supported_languages.contains(&normalized_language.as_str()) {
        return Err(format!(
            "Język '{}' nie jest obsługiwany. Aktualnie obsługiwane języki to: {}",
            normalized_language,
            supported_languages.join(", ")
        ));
    }
    
    // Get thread-safe access to active servers
    let is_server_running = {
        let active_servers = get_active_servers();
        let servers_read = active_servers.read().unwrap();
        servers_read.contains_key(&normalized_language)
    };
    
    // If server is already running, exit early
    if is_server_running {
        println!("Serwer LSP dla języka {} już działa, pomijam tworzenie nowego", normalized_language);
        return Ok(format!("LSP server for {} is already running", normalized_language));
    }
    
    // Add this language to active servers
    {
        let active_servers = get_active_servers();
        let mut servers_write = active_servers.write().unwrap();
        servers_write.insert(normalized_language.clone(), true);
    }
    
    let language_clone = normalized_language.clone();
    let file_path_clone = file_path.clone();
    
    // Używamy standardowego wątku zamiast tokio::task::spawn
    thread::spawn(move || {
        // Utwórz nowy runtime tokio dla tego wątku
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))
            .unwrap();
            
        // Uruchom asynchroniczne zadanie w nowym runtime
        rt.block_on(async {
            // Utworz kopię języka przed użyciem w zadaniu, żeby oryginał mógł być użyty w obsłudze błędów
            let language_for_server = language_clone.clone();
            
            if let Err(e) = start_language_server(language_for_server, file_path_clone).await {
                // Jeśli serwer zakończył działanie, usuń go z mapy aktywnych serwerów
                let active_servers = get_active_servers();
                let mut servers_write = active_servers.write().unwrap();
                servers_write.remove(&language_clone);
                
                eprintln!("LSP server error: {}", e);
            }
        });
    });
    
    Ok(format!("Started LSP server for {}", normalized_language))
}

/// Tauri command to start the LSP WebSocket server
#[tauri::command]
pub async fn start_lsp_websocket_server(port: u16) -> Result<String, String> {
    // Sprawdź, czy serwer już działa
    if WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        return Ok(format!("LSP WebSocket server already running on port {}", port));
    }

    // Najpierw sprawdzamy, czy port jest już zajęty - próbujemy stworzyć tester socket
    let addr = format!("127.0.0.1:{}", port);
    match std::net::TcpListener::bind(&addr) {
        Ok(_) => {
            // Port jest dostępny, możemy kontynuować
            println!("Port {} jest dostępny, uruchamiam serwer WebSocket", port);
        },
        Err(e) => {
            // Port jest zajęty, prawdopodobnie inny proces już działa
            println!("Port {} jest już zajęty: {}", port, e);
            
            // Ustaw flagę, że serwer działa, bo prawdopodobnie uruchomił go inny proces
            WS_SERVER_RUNNING.store(true, Ordering::SeqCst);
            
            // Zwróć sukces, ale poinformuj, że serwer był już uruchomiony
            return Ok(format!("LSP WebSocket server is already running on port {}", port));
        }
    }

    let ws_manager = WebSocketManager::new();
    
    // Zapisz instancję managera w globalnej zmiennej
    unsafe {
        WS_MANAGER = Some(ws_manager.clone());
    }
    
    // Uruchom serwer WebSocket w nowym wątku
    let port_clone = port;
    thread::spawn(move || {
        // Utwórz nowy runtime tokio dla tego wątku
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| format!("Failed to create runtime: {}", e))
            .unwrap();
            
        // Uruchom asynchroniczne zadanie w nowym runtime
        rt.block_on(async {
            // Ustaw flagę, że serwer jest uruchomiony
            WS_SERVER_RUNNING.store(true, Ordering::SeqCst);
            
            // Próbuj uruchomić serwer z dynamicznym przydziałem portów
            let mut current_port = port_clone;
            let max_attempts = 5;
            
            for attempt in 0..max_attempts {
                match ws_manager.start_server(current_port).await {
                    Ok(_) => {
                        // Port był dostępny, serwer uruchomiony
                        println!("LSP WebSocket server uruchomiony pomyślnie na porcie {}", current_port);
                        break;
                    },
                    Err(e) => {
                        eprintln!("Próba {}/{}: Nie można uruchomić serwera WebSocket na porcie {}: {}", 
                            attempt+1, max_attempts, current_port, e);
                            
                        if attempt < max_attempts - 1 {
                            // Spróbuj następny port
                            current_port += 1;
                            println!("Próba użycia portu {}...", current_port);
                        } else {
                            eprintln!("Wyczerpano wszystkie próby uruchomienia serwera WebSocket ({} prób)", max_attempts);
                            WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
                        }
                    }
                }
            }
        });
    });
    
    Ok(format!("Starting LSP WebSocket server on port {} (or next available)", port))
}

/// Funkcja sprawdzająca czy serwer WebSocket jest uruchomiony
#[tauri::command]
pub fn is_lsp_websocket_running() -> bool {
    WS_SERVER_RUNNING.load(Ordering::SeqCst)
}

/// Zatrzymuje serwer WebSocket LSP
#[tauri::command]
pub async fn stop_lsp_websocket_server() -> Result<String, String> {
    // Sprawdź, czy serwer działa
    if !WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        return Ok("LSP WebSocket server not running".to_string());
    }
    
    // Pobierz instancję managera
    let ws_manager = unsafe {
        match WS_MANAGER {
            Some(ref manager) => manager,
            None => return Err("WebSocket manager not initialized".to_string()),
        }
    };
    
    // Zatrzymaj serwer
    if let Err(e) = ws_manager.stop_server().await {
        eprintln!("Error stopping WebSocket server: {}", e);
        return Err(format!("Failed to stop WebSocket server: {}", e));
    }
    
    // Ustaw flagę, że serwer jest zatrzymany
    WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
    
    Ok("LSP WebSocket server stopped".to_string())
}

/// Obsługa zamknięcia aplikacji - zatrzymanie serwera WebSocket
pub fn cleanup_on_exit() {
    // Sprawdź, czy serwer działa
    if WS_SERVER_RUNNING.load(Ordering::SeqCst) {
        // Utwórz nowy runtime tokio dla tego wątku
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("Failed to create runtime for cleanup: {}", e);
                return;
            }
        };
        
        // Pobierz instancję managera
        let ws_manager = unsafe {
            match WS_MANAGER {
                Some(ref manager) => manager,
                None => {
                    eprintln!("WebSocket manager not initialized for cleanup");
                    return;
                }
            }
        };
        
        // Zatrzymaj serwer
        rt.block_on(async {
            if let Err(e) = ws_manager.stop_server().await {
                eprintln!("Error stopping WebSocket server during cleanup: {}", e);
            }
        });
        
        // Ustaw flagę, że serwer jest zatrzymany
        WS_SERVER_RUNNING.store(false, Ordering::SeqCst);
        
        println!("LSP WebSocket server stopped during application shutdown");
    }
}

/// Znajduje katalog główny projektu na podstawie ścieżki pliku i języka
/// 
/// Ta funkcja jest używana przez edytor kodu do znajdowania katalogu głównego projektu
/// w celu prawidłowej inicjalizacji serwera LSP.
/// 
/// # Arguments
/// 
/// * `file_path` - Ścieżka do pliku, dla którego szukamy katalogu głównego projektu
/// * `language` - Opcjonalny parametr określający język programowania (wpływa na sposób wykrywania katalogu głównego)
/// 
/// # Returns
/// 
/// Ścieżkę do katalogu głównego projektu lub błąd, jeśli nie udało się go znaleźć
#[tauri::command]
pub async fn find_project_root(file_path: String, language: Option<String>) -> Result<String, String> {
    let _server_factory = ServerFactory::new();
    let lang = language.unwrap_or_else(|| "generic".to_string());
    
    // Sprawdź, czy język jest obsługiwany, jeśli podano konkretny język
    if lang != "generic" {
        let recognized_languages = get_recognized_languages();
        
        if !recognized_languages.contains(&lang.to_lowercase().as_str()) {
            return Err(format!(
                "Język '{}' nie jest rozpoznawany. Aktualnie rozpoznawane języki to: {}",
                lang,
                recognized_languages.join(", ")
            ));
        }
    }
    
    println!("Backend: find_project_root wywołane dla ścieżki: {}, język: {}", file_path, lang);
    
    match _server_factory.find_project_root(&lang, &file_path) {
        Ok(root_path) => {
            println!("Backend: znaleziono katalog główny: {}", root_path);
            Ok(root_path)
        },
        Err(e) => {
            println!("Backend: błąd znajdowania katalogu głównego: {}", e);
            Err(format!("Failed to find project root: {}", e))
        }
    }
} 
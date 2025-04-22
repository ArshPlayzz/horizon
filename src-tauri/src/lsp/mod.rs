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
use serde::{Serialize, Deserialize};
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

/// Struktura reprezentująca sformatowane dane hover
#[derive(Serialize, Deserialize)]
pub struct FormattedHoverData {
    title: String,
    signature: Option<String>,
    documentation: Option<String>,
    source_code: Option<String>,
    raw: String,
}

/// Formatuje dane hover z LSP do bardziej strukturalnej formy
/// 
/// Przyjmuje zawartość hover i zwraca ją w ustrukturyzowanej formie z wyodrębnionym tytułem,
/// sygnaturą, dokumentacją i fragmentem kodu źródłowego (jeśli dostępne).
#[tauri::command]
pub fn format_hover_data(contents: String) -> Result<FormattedHoverData, String> {
    if contents.is_empty() {
        return Err("Empty hover contents".to_string());
    }
    
    // Domyślne wartości
    let mut title = "Unknown".to_string();
    let mut signature = None;
    let mut documentation = None;
    let mut source_code = None;
    
    // Próbujemy podzielić zawartość według typowych sekcji markdown
    let lines: Vec<&str> = contents.lines().collect();
    
    if !lines.is_empty() {
        // Pierwsza linia często zawiera nazwę elementu i jego typ
        title = lines[0].trim().to_string();
        
        // Jeśli tytuł zawiera "```" (kod), wyciągnijmy czystą nazwę
        if title.contains("```") {
            let parts: Vec<&str> = title.split("```").collect();
            if parts.len() > 1 {
                // Bierzemy część po pierwszym znaczniku, ale przed zamykającym (jeśli istnieje)
                title = parts[1].trim().to_string();
                
                // Usuń identyfikator języka, jeśli jest obecny (np. ```rust)
                let lang_parts: Vec<&str> = title.split_whitespace().collect();
                if !lang_parts.is_empty() && (lang_parts[0] == "rust" || lang_parts[0] == "ts" || 
                   lang_parts[0] == "js" || lang_parts[0] == "typescript" || lang_parts[0] == "javascript") {
                    title = lang_parts[1..].join(" ");
                }
            }
        }
        
        // Szukamy bloku kodu (sygnatura, definicja funkcji itp.)
        let mut in_code_block = false;
        let mut code_lines = Vec::new();
        let mut doc_lines = Vec::new();
        let mut possible_signature_found = false;
        
        for line in lines.iter().skip(1) {
            let line_str = line.trim();
            
            // Wykrywanie bloków kodu
            if line_str.starts_with("```") {
                in_code_block = !in_code_block;
                continue;
            }
            
            if in_code_block {
                // Pomijamy potencjalny identyfikator języka na początku bloku kodu
                if code_lines.is_empty() && (line_str == "rust" || line_str == "ts" || 
                   line_str == "js" || line_str == "typescript" || line_str == "javascript") {
                    continue;
                }
                
                code_lines.push(line_str.to_string());
            } else if !line_str.is_empty() { 
                // Sprawdź czy linia wygląda jak odwołanie do funkcji (może być błędnie oznaczona jako dokumentacja)
                if !possible_signature_found && 
                   (line_str.contains("fn ") || line_str.contains("pub fn ") || 
                    line_str.contains("function") || line_str.contains("(") && line_str.contains(")")) {
                    
                    // Sprawdźmy czy to naprawdę sygnatura, a nie wzmianka w dokumentacji
                    let is_likely_signature = line_str.contains("->") || 
                                             (line_str.contains("(") && line_str.contains(")") && 
                                              (line_str.contains("fn ") || line_str.contains("function")));
                    
                    if is_likely_signature {
                        if signature.is_none() {
                            signature = Some(line_str.to_string());
                            possible_signature_found = true;
                            continue;
                        }
                    }
                }
                
                // Zbieramy niepuste linie jako dokumentację
                // Sanityzujemy znaki specjalne markdown, które mogą psuć formatowanie
                let sanitized_line = sanitize_markdown(line_str);
                doc_lines.push(sanitized_line);
            }
        }
        
        // Ustawiamy wykryte wartości
        if !code_lines.is_empty() {
            // Jeśli nie znaleźliśmy sygnatury wcześniej, pierwsza linia kodu często zawiera sygnaturę
            if signature.is_none() {
                signature = Some(code_lines[0].to_string());
            }
            
            // Reszta kodu to źródło
            if code_lines.len() > 1 {
                source_code = Some(code_lines.join("\n"));
            } else if code_lines.len() == 1 && possible_signature_found {
                // Jeśli mamy tylko jedną linię kodu i wcześniej znaleźliśmy sygnaturę, 
                // prawdopodobnie to też jest kod źródłowy
                source_code = Some(code_lines[0].to_string());
            }
        }
        
        if !doc_lines.is_empty() {
            documentation = Some(doc_lines.join("\n"));
        }
    }
    
    // Jeśli tytuł wydaje się zbyt długi lub zawiera nowe linie,
    // próbujemy wyciągnąć bardziej zwięzłą wersję
    if title.contains('\n') || title.len() > 100 {
        // Rozdzielamy na podstawie typowych separatorów
        let parts: Vec<&str> = title.split(|c| c == ' ' || c == '\n' || c == ':' || c == '-').collect();
        let short_title = parts.iter()
            .filter(|&&s| !s.is_empty())  // Filtruję puste części
            .take(3)                      // Biorę 3 pierwsze części
            .map(|&s| s.to_string())
            .collect::<Vec<String>>()
            .join(" ");
        
        if !short_title.is_empty() {
            title = short_title + "...";
        }
    }
    
    // Upewnijmy się, że tytuł nie zawiera niechcianych znaczników markdown
    title = sanitize_markdown(&title);
    
    // Jeśli tytuł zawiera tylko "Unknown", ale mamy sygnaturę, wyciągnijmy nazwę z sygnatury
    if title == "Unknown" && signature.is_some() {
        if let Some(sig) = &signature {
            if sig.contains("fn ") {
                if let Some(fn_part) = sig.split("fn ").nth(1) {
                    if let Some(name_part) = fn_part.split('(').next() {
                        title = name_part.trim().to_string();
                    }
                }
            } else if sig.contains("struct ") {
                if let Some(struct_part) = sig.split("struct ").nth(1) {
                    if let Some(name_part) = struct_part.split(|c| c == '{' || c == '<' || c == ' ').next() {
                        title = name_part.trim().to_string();
                    }
                }
            }
        }
    }
    
    Ok(FormattedHoverData {
        title,
        signature,
        documentation,
        source_code,
        raw: contents,
    })
}

/// Funkcja pomocnicza do czyszczenia tekstu z problematycznych znaczników markdown
fn sanitize_markdown(text: &str) -> String {
    let mut result = text.to_string();
    
    // Rozwiązanie problemu z nieoczekiwanymi znakami formatowania markdown
    // Zamieniamy pojedyncze * na ich escaped wersje, ale tylko jeśli nie są częścią ciągu **
    let mut i = 0;
    while i < result.len() {
        if result[i..].starts_with('*') {
            if i + 1 < result.len() && result[i+1..].starts_with('*') {
                // To jest "**", pomijamy oba znaki
                i += 2;
            } else {
                // To jest pojedynczy "*", zamieniamy na escaped wersję
                result.replace_range(i..i+1, "\\*");
                i += 2; // przesuwamy się o 2, bo dodaliśmy znak "\"
            }
        } else {
            i += 1;
        }
    }
    
    // Podobnie dla innych problematycznych znaków markdown
    result = result.replace("_", "\\_")
                 .replace("##", "\\##")
                 .replace("###", "\\###");
    
    // Zachowaj poprawne formatowanie inline code (tekst w pojedynczych backtickach)
    // Regex byłby lepszy, ale upraszczamy
    let mut preserving_code = String::new();
    let mut inside_code = false;
    let mut current_segment = String::new();
    
    for c in result.chars() {
        if c == '`' {
            // Toggle stan (wewnątrz/na zewnątrz kodu)
            inside_code = !inside_code;
            
            // Dodaj backtick do aktualnego segmentu
            current_segment.push(c);
            
            // Jeśli zamknęliśmy kod, dodaj go do wyniku i wyczyść segment
            if !inside_code {
                preserving_code.push_str(&current_segment);
                current_segment.clear();
            }
        } else if inside_code {
            // Wewnątrz kodu zachowujemy wszystkie znaki bez zmian
            current_segment.push(c);
        } else {
            // Poza kodem, dodajemy przetworzone znaki
            preserving_code.push(c);
        }
    }
    
    // Obsługa przypadku gdy string kończy się niezamkniętym backtick
    if !current_segment.is_empty() {
        preserving_code.push_str(&current_segment);
    }
    
    // Usuwamy ewentualne redundantne znaczniki escape
    let final_result = preserving_code.replace("\\\\*", "\\*")
                     .replace("\\\\_", "\\_")
                     .replace("\\\\#", "\\#");
                 
    final_result
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
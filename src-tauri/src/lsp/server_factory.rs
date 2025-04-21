use anyhow::{Result, anyhow};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::path::Path;
use serde_json::{Value, json};
use async_trait::async_trait;
use tower_lsp::{LanguageServer, Client};
use tower_lsp::jsonrpc::Result as LspResult;
use tower_lsp::lsp_types::*;
use url;

use crate::lsp::servers::rust::RustLanguageServer;

/// Enum with all supported language server types
pub enum LanguageServerInstance {
    Rust(RustLanguageServer),
    // Dodaj więcej typów serwerów w przyszłości
}

impl LanguageServerInstance {
    pub fn with_client(self, client: Client) -> Self {
        match self {
            LanguageServerInstance::Rust(server) => LanguageServerInstance::Rust(server.with_client(client)),
            // Dodaj obsługę dla innych typów serwerów w przyszłości
        }
    }
}

// Dodajemy interfejs dla serwera LSP, który będzie zarządzany przez fabrykę
#[async_trait]
pub trait ManagedLanguageServer: Send + Sync {
    // Przekazanie żądania JSON-RPC do serwera
    async fn handle_request(&self, request_text: &str) -> Result<String>;
    
    // Zatrzymanie serwera
    async fn shutdown(&self) -> Result<()>;
    
    // Możliwości serwera
    fn get_capabilities(&self) -> Value;
}

/// Factory for creating language server instances.
/// This provides a centralized way to instantiate LSP servers for different languages.
pub struct ServerFactory {
    // Zapamiętuje utworzone serwery, identyfikowane przez unikalny identyfikator
    servers: Mutex<HashMap<String, Arc<dyn ManagedLanguageServer>>>,
    next_id: Mutex<u64>,
}

impl ServerFactory {
    /// Creates a new server factory instance
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
    
    /// Tworzy nowy identyfikator serwera
    fn generate_server_id(&self) -> String {
        let mut id = self.next_id.lock().unwrap();
        let server_id = format!("server_{}", *id);
        *id += 1;
        server_id
    }
    
    /// Creates and registers a LSP server instance based on the language
    /// Returns the server ID if successful, or an error if the language is not supported
    pub async fn create_server(&self, language: &str, file_path: &str) -> Result<String> {
        let server_id = self.generate_server_id();
        
        println!("Tworzenie serwera LSP dla języka: '{}', ścieżka: '{}'", language, file_path);
        
        // Znormalizuj język do małych liter
        let normalized_language = language.to_lowercase();
        
        // Znajdź właściwy katalog główny projektu
        let root_path = self.find_project_root(&normalized_language, file_path)?;
        println!("Rzeczywisty katalog główny projektu dla {}: {}", normalized_language, root_path);
        
        let server: Arc<dyn ManagedLanguageServer> = match normalized_language.as_str() {
            "rust" => {
                println!("Tworzenie RUST adaptera dla języka: '{}'", normalized_language);
                let rust_server = RustLspAdapter::new(normalized_language.to_string(), root_path)?;
                Arc::new(rust_server)
            },
            // Możemy dodać więcej serwerów dla innych języków
            "typescript" | "javascript" => {
                // Przykład dla TypeScript/JavaScript - zakładamy, że mamy odpowiedni adapter
                println!("Tworzenie TS/JS adaptera dla języka: '{}'", normalized_language);
                // TODO: Zaimplementować rzeczywisty adapter dla TypeScript/JavaScript
                return Err(anyhow!("Adapter dla języka '{}' nie został jeszcze zaimplementowany", normalized_language));
            },
            "python" => {
                // Przykład dla Pythona - zakładamy, że mamy odpowiedni adapter
                println!("Tworzenie Python adaptera dla języka: '{}'", normalized_language);
                // TODO: Zaimplementować rzeczywisty adapter dla Pythona
                return Err(anyhow!("Adapter dla języka '{}' nie został jeszcze zaimplementowany", normalized_language));
            },
            // Dla innych języków zwracamy błąd
            _ => {
                return Err(anyhow!("Język '{}' nie jest obsługiwany. Brak serwera LSP dla tego języka.", normalized_language));
            }
        };
        
        // Zapisz serwer w kolekcji
        self.servers.lock().unwrap().insert(server_id.clone(), server);
        
        Ok(server_id)
    }
    
    /// Stops and removes a language server
    pub async fn stop_server(&self, server_id: String) -> Result<()> {
        // Pobierz serwer w bloku, aby mutex był zwolniony przed wywołaniem asynchronicznym
        let server = {
            let mut servers = self.servers.lock().unwrap();
            servers.remove(&server_id)
        };
        
        // Sprawdź, czy serwer istnieje
        if let Some(server) = server {
            // Zatrzymaj serwer
            server.shutdown().await?;
            Ok(())
        } else {
            Err(anyhow!("Server not found: {}", server_id))
        }
    }
    
    /// Forwards a JSON-RPC request to the specified server
    pub async fn forward_request(&self, server_id: &str, request_text: &str) -> Result<String> {
        // Pobierz serwer w bloku, aby mutex był zwolniony przed wywołaniem asynchronicznym
        let server = {
            let servers = self.servers.lock().unwrap();
            servers.get(server_id).cloned()
        };
        
        // Sprawdź, czy serwer istnieje
        if let Some(server) = server {
            server.handle_request(request_text).await
        } else {
            Err(anyhow!("Server not found: {}", server_id))
        }
    }
    
    /// Returns a JSON object with capabilities if the language is supported,
    /// or an error message if the language is not supported
    pub fn get_server_capabilities(&self, language: &str) -> Value {
        // Znormalizuj język do małych liter
        let normalized_language = language.to_lowercase();
        
        println!("Pobieranie capabilities dla języka: {}", normalized_language);
        
        // Utwórz tymczasowy serwer, aby uzyskać prawdziwe capabilities
        // Potrzebujemy tymczasowej ścieżki pliku, więc używamy bieżącego katalogu
        let current_dir = std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .to_string_lossy()
            .to_string();
            
        // Spróbuj utworzyć instancję serwera
        match normalized_language.as_str() {
            "rust" => {
                match RustLspAdapter::new(normalized_language.to_string(), current_dir.clone()) {
                    Ok(adapter) => {
                        // Używamy tej samej metody get_capabilities, którą właśnie poprawiliśmy
                        return adapter.get_capabilities();
                    },
                    Err(e) => {
                        let error_msg = format!("Nie można utworzyć adaptera Rust LSP: {}", e);
                        eprintln!("BŁĄD: {}", error_msg);
                        return json!({
                            "error": error_msg,
                            "_type": "capabilities_error",
                            "source": "server_factory_rust_adapter_creation"
                        });
                    }
                }
            },
            // Jeśli implementujemy nowe adaptery LSP w przyszłości, dodamy je tutaj
            "typescript" | "javascript" | "python" => {
                // Zaplanowane do implementacji w przyszłości
                let error_msg = format!("Adapter dla języka '{}' nie został jeszcze zaimplementowany", normalized_language);
                eprintln!("INFO: {}", error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "server_factory_planned_language"
                });
            },
            // Dla nieobsługiwanych języków zwracamy informację o braku wsparcia
            _ => {
                let error_msg = format!("Język '{}' nie jest obsługiwany. Brak serwera LSP dla tego języka.", normalized_language);
                eprintln!("INFO: {}", error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "server_factory_unsupported_language"
                });
            }
        }
    }

    /// Creates a direct language server instance for the specified language
    /// This instance can be used directly with LspService
    /// Returns an error if the language is not supported
    pub fn create_language_server_instance(&self, language: &str, file_path: &str) -> Result<LanguageServerInstance> {
        // Znormalizuj język do małych liter
        let normalized_language = language.to_lowercase();
        
        println!("Tworzenie instancji serwera dla języka: {}, ścieżka: {}", normalized_language, file_path);
        
        // Próba lepszego wykrycia języka, jeśli podany jest "unknown" lub pusty
        let final_language = if normalized_language == "unknown" || normalized_language.is_empty() {
            // Spróbuj wykryć język na podstawie rozszerzenia pliku
            use std::path::Path;
            let path = Path::new(file_path);
            
            if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                match extension {
                    "rs" => "rust".to_string(),
                    "py" => "python".to_string(),
                    "js" => "javascript".to_string(),
                    "ts" => "typescript".to_string(),
                    _ => normalized_language.clone()
                }
            } else {
                // Jeśli nie wykryto rozszerzenia, spróbuj znaleźć pliki projektu
                if path.is_dir() || (path.parent().map_or(false, |p| p.exists())) {
                    let dir_to_check = if path.is_dir() { path } else { path.parent().unwrap() };
                    
                    if dir_to_check.join("Cargo.toml").exists() {
                        "rust".to_string()
                    } else if dir_to_check.join("package.json").exists() {
                        if dir_to_check.join("tsconfig.json").exists() {
                            "typescript".to_string()
                        } else {
                            "javascript".to_string()
                        }
                    } else {
                        normalized_language.clone()
                    }
                } else {
                    normalized_language.clone()
                }
            }
        } else {
            normalized_language.clone()
        };
        
        println!("Używam finalnego języka do utworzenia serwera: {}", final_language);
        
        // Znajdź właściwy katalog główny projektu
        let root_path = self.find_project_root(&final_language, file_path)?;
        println!("Rzeczywisty katalog główny projektu dla {}: {}", final_language, root_path);
        
        match final_language.as_str() {
            "rust" => {
                let server = RustLanguageServer::new(root_path)?;
                Ok(LanguageServerInstance::Rust(server))
            },
            // Dodaj więcej serwerów języków w przyszłości
            _ => {
                // Zwracamy błąd zamiast używać fallbacku
                Err(anyhow!("Język '{}' nie jest obsługiwany. Brak serwera LSP dla tego języka.", final_language))
            }
        }
    }

    /// Znajduje katalog główny projektu na podstawie pliku konfiguracyjnego
    pub fn find_project_root(&self, language: &str, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);
        
        println!("Szukam katalogu głównego projektu dla języka: {}, ścieżka pliku: {}", language, file_path);
        
        // Sprawdź, czy podana ścieżka istnieje
        if !path.exists() {
            println!("Ścieżka nie istnieje: {}", file_path);
            return Err(anyhow!("Podana ścieżka nie istnieje: {}", file_path));
        }
        
        // Ustal ścieżkę startową (plik lub katalog)
        let start_dir = if path.is_dir() {
            path.to_path_buf()
        } else {
            // Jeśli to plik, weź jego katalog
            match path.parent() {
                Some(parent) => parent.to_path_buf(),
                None => {
                    println!("Nie znaleziono katalogu nadrzędnego dla: {}", file_path);
                    return Err(anyhow!("Nie można znaleźć katalogu nadrzędnego dla: {}", file_path));
                }
            }
        };
        
        println!("Katalog początkowy wyszukiwania: {}", start_dir.display());
        
        // Określ pliki konfiguracyjne w zależności od języka
        let config_files = match language.to_lowercase().as_str() {
            "rust" => vec!["Cargo.toml"],
            "javascript" | "typescript" => vec!["package.json", "tsconfig.json"],
            "python" => vec!["pyproject.toml", "setup.py", "requirements.txt"],
            "go" => vec!["go.mod"],
            "c" | "cpp" => vec!["CMakeLists.txt", "Makefile", "configure"],
            "java" => vec!["pom.xml", "build.gradle", "settings.gradle"],
            // Dla "generic" lub nieznanego języka, sprawdzamy popularne pliki konfiguracyjne
            _ => vec![
                "Cargo.toml", "package.json", "pyproject.toml", "go.mod", 
                "CMakeLists.txt", "Makefile", "pom.xml", "build.gradle"
            ],
        };
        
        println!("Szukam plików konfiguracyjnych: {:?}", config_files);
        
        // Implementacja szukania w górę drzewa katalogów
        let mut current_dir = start_dir.clone();
        
        // Zaczynamy od sprawdzenia bieżącego katalogu
        println!("Sprawdzam katalog: {}", current_dir.display());
        
        // Ustawiamy maksymalną liczbę przejść w górę drzewa katalogów
        let max_iterations = 10; // Zabezpieczenie przed nieskończoną pętlą
        let mut iterations = 0;
        
        loop {
            // Sprawdź, czy którykolwiek z plików konfiguracyjnych istnieje w bieżącym katalogu
            for config_file in &config_files {
                let config_path = current_dir.join(config_file);
                if config_path.exists() {
                    println!("Znaleziono plik konfiguracyjny: {} w katalogu: {}", 
                             config_file, current_dir.display());
                    return Ok(current_dir.to_string_lossy().to_string());
                }
            }
            
            // Zwiększamy licznik iteracji
            iterations += 1;
            if iterations >= max_iterations {
                println!("Osiągnięto maksymalną liczbę iteracji bez znalezienia pliku konfiguracyjnego. Używam katalogu początkowego: {}",
                         start_dir.display());
                return Ok(start_dir.to_string_lossy().to_string());
            }
            
            // Próbujemy przejść do katalogu nadrzędnego
            match current_dir.parent() {
                Some(parent) => {
                    // Sprawdź, czy faktycznie przeszliśmy wyżej (unikamy pętli nieskończonej)
                    if parent == current_dir {
                        println!("Nie można przejść wyżej w drzewie katalogów. Używam katalogu początkowego: {}", 
                                 start_dir.display());
                        return Ok(start_dir.to_string_lossy().to_string());
                    }
                    
                    // Aktualizuj bieżący katalog
                    current_dir = parent.to_path_buf();
                    println!("Przechodzę do katalogu nadrzędnego: {}", current_dir.display());
                },
                None => {
                    // Doszliśmy do korzenia systemu plików i nie znaleźliśmy pliku konfiguracyjnego
                    println!("Osiągnięto korzeń systemu plików bez znalezienia pliku konfiguracyjnego. Używam katalogu początkowego: {}", 
                             start_dir.display());
                    return Ok(start_dir.to_string_lossy().to_string());
                }
            }
        }
    }

    /// Sprawdza, czy dany katalog jest katalogiem głównym projektu dla określonego języka
    pub fn is_project_root(&self, language: &str, dir_path: &str) -> bool {
        let path = Path::new(dir_path);
        
        // Sprawdź, czy ścieżka istnieje i jest katalogiem
        if !path.exists() || !path.is_dir() {
            println!("Ścieżka nie istnieje lub nie jest katalogiem: {}", dir_path);
            return false;
        }
        
        // Określ pliki konfiguracyjne w zależności od języka (identycznie jak w find_project_root)
        let config_files = match language.to_lowercase().as_str() {
            "rust" => vec!["Cargo.toml"],
            "javascript" | "typescript" => vec!["package.json", "tsconfig.json"],
            "python" => vec!["pyproject.toml", "setup.py", "requirements.txt"],
            "go" => vec!["go.mod"],
            "c" | "cpp" => vec!["CMakeLists.txt", "Makefile", "configure"],
            "java" => vec!["pom.xml", "build.gradle", "settings.gradle"],
            // Dla "generic" lub nieznanego języka, sprawdzamy popularne pliki konfiguracyjne
            _ => vec![
                "Cargo.toml", "package.json", "pyproject.toml", "go.mod", 
                "CMakeLists.txt", "Makefile", "pom.xml", "build.gradle"
            ],
        };
        
        // Sprawdź, czy którykolwiek z plików konfiguracyjnych istnieje w tym katalogu
        for config_file in &config_files {
            let config_path = path.join(config_file);
            if config_path.exists() {
                println!("Katalog jest głównym katalogiem projektu dla języka {} - znaleziono plik: {}", 
                         language, config_file);
                return true;
            }
        }
        
        println!("Katalog nie jest głównym katalogiem projektu dla języka {}: {}", language, dir_path);
        false
    }
}

// Adapter dla serwera Rust LSP
struct RustLspAdapter {
    language: String,
    root_path: String,
    server: Arc<RustLanguageServer>,
}

impl RustLspAdapter {
    fn new(language: String, root_path: String) -> Result<Self> {
        let server = RustLanguageServer::new(root_path.clone())?;
        Ok(Self {
            language,
            root_path,
            server: Arc::new(server),
        })
    }
}

#[async_trait]
impl ManagedLanguageServer for RustLspAdapter {
    async fn handle_request(&self, request_text: &str) -> Result<String> {
        // Konwertuj tekst JSON-RPC na odpowiednie żądanie
        match serde_json::from_str::<serde_json::Value>(request_text) {
            Ok(json_rpc) => {
                // Pobierz ID i metodę z żądania
                let id = json_rpc.get("id").cloned().unwrap_or(Value::Null);
                let method = json_rpc.get("method").and_then(|m| m.as_str()).unwrap_or("");
                let params = json_rpc.get("params").cloned().unwrap_or(Value::Null);
                
                // Używamy pola server do przekazania żądania do prawdziwego serwera
                // W zależności od metody będziemy delegować odpowiednie wywołania
                match method {
                    "initialize" => {
                        println!("Otrzymano żądanie initialize");
                        
                        // Prepare initialize params from the JSON-RPC request
                        if let Ok(mut params_value) = serde_json::from_value::<InitializeParams>(params) {
                            // Make sure rootPath is properly set
                            let root_path_str = self.root_path.clone();
                            let root_uri = url::Url::from_file_path(&root_path_str).unwrap_or_else(|_| {
                                url::Url::parse(&format!("file://{}", root_path_str)).unwrap()
                            });
                            
                            params_value.root_uri = Some(root_uri.clone());
                            
                            // Don't create a tokio runtime - we're already in one
                            // Use the existing server to handle the initialize request
                            match self.server.initialize(params_value).await {
                                Ok(result) => {
                                    // Utwórz odpowiedź JSON-RPC
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": result
                                    });
                                    
                                    return Ok(response.to_string());
                                },
                                Err(e) => {
                                    // Utwórz odpowiedź z błędem
                                    let error = format!("Initialize error: {}", e);
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            }
                        } else {
                            // Błędne parametry
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid params"
                                }
                            });
                            
                            return Ok(response.to_string());
                        }
                    },
                    "initialized" => {
                        println!("Otrzymano powiadomienie 'initialized' dla serwera Rust");
                        
                        // Przekazujemy powiadomienie 'initialized' do serwera
                        let initialized_params = InitializedParams {};
                        self.server.initialized(initialized_params).await;
                        
                        // Dla powiadomień (bez ID) nie wysyłamy odpowiedzi
                        return Ok("".to_string());
                    },
                    "textDocument/didOpen" => {
                        println!("Otwieranie dokumentu w serwerze Rust");
                        
                        // Przekształć params na DidOpenTextDocumentParams
                        if let Ok(open_params) = serde_json::from_value::<DidOpenTextDocumentParams>(params.clone()) {
                            // Przekaż żądanie do serwera
                            self.server.did_open(open_params).await;
                            
                            // Dla powiadomień (metody zaczynające się od 'textDocument/did') nie wysyłamy odpowiedzi
                            return Ok("".to_string());
                        } else {
                            // W przypadku niepowodzenia w parsowaniu parametrów, logujemy i ignorujemy
                            println!("Nie udało się sparsować parametrów didOpen");
                            return Ok("".to_string());
                        }
                    },
                    "textDocument/completion" => {
                        // Przekonwertuj parametry na odpowiedni typ
                        if let Ok(completion_params) = serde_json::from_value::<CompletionParams>(params) {
                            println!("Żądanie uzupełniania dla serwera Rust: {}", self.language);
                            
                            // Utwórz runtime tokio do wywołania asynchronicznego
                            let runtime = match tokio::runtime::Runtime::new() {
                                Ok(rt) => rt,
                                Err(e) => {
                                    let error_msg = format!("Nie udało się utworzyć tokio runtime: {}", e);
                                    println!("BŁĄD: {}", error_msg);
                                    
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error_msg
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            };
                            
                            // Sklonuj serwer do użycia w bloku async
                            let server_clone = self.server.clone();
                            
                            // Wywołaj completion na serwerze
                            let completion_result = runtime.block_on(async move {
                                match server_clone.completion(completion_params).await {
                                    Ok(result) => result,
                                    Err(e) => {
                                        println!("Błąd podczas wykonywania completion: {:?}", e);
                                        None
                                    }
                                }
                            });
                            
                            // Przygotuj rezultat do odpowiedzi JSON-RPC
                            let result = match completion_result {
                                Some(completion) => {
                                    // Serializuj wynik do JSON
                                    match serde_json::to_value(completion) {
                                        Ok(completion_json) => completion_json,
                                        Err(e) => {
                                            println!("Błąd podczas serializacji wyniku completion: {}", e);
                                            json!({
                                                "isIncomplete": true,
                                                "items": []
                                            })
                                        }
                                    }
                                },
                                None => {
                                    // Jeśli nie ma wyniku completion, zwracamy pustą listę
                                    json!({
                                        "isIncomplete": false,
                                        "items": []
                                    })
                                }
                            };
                            
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": result
                            });
                            
                            return Ok(response.to_string());
                        } else {
                            // Nieprawidłowe parametry
                            let error_response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid parameters for completion method"
                                }
                            });
                            
                            return Ok(error_response.to_string());
                        }
                    },
                    "textDocument/hover" => {
                        // Używamy informacji o języku z pola language
                        println!("Hover request in {} project at {}", self.language, self.root_path);
                        
                        // Przygotujemy parametry HoverParams z żądania JSON-RPC
                        if let Ok(hover_params) = serde_json::from_value::<HoverParams>(params.clone()) {
                            // Don't create a new runtime - use the existing one
                            match self.server.hover(hover_params).await {
                                Ok(hover_result) => {
                                    // Przygotuj odpowiedź JSON-RPC
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": hover_result
                                    });
                                    
                                    return Ok(response.to_string());
                                },
                                Err(e) => {
                                    // Błąd przetwarzania hover
                                    let error_msg = format!("Błąd podczas przetwarzania hover: {}", e);
                                    println!("BŁĄD: {}", error_msg);
                                    
                                    let response = json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": {
                                            "code": -32603,
                                            "message": error_msg
                                        }
                                    });
                                    
                                    return Ok(response.to_string());
                                }
                            }
                        } else {
                            // Nieprawidłowe parametry
                            let response = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32602,
                                    "message": "Invalid params for hover method"
                                }
                            });
                            
                            return Ok(response.to_string());
                        }
                    },
                    _ => {
                        // Dla innych metod możemy zaimplementować bardziej bezpośrednią delegację
                        // do serwera lub zwracać domyślną odpowiedź
                        println!("Nieobsługiwana metoda LSP: {}", method);
                        let result = json!({});
                        
                        let response = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": result
                        });
                        
                        Ok(response.to_string())
                    }
                }
            },
            Err(e) => Err(anyhow!("Failed to parse JSON-RPC request: {}", e))
        }
    }
    
    async fn shutdown(&self) -> Result<()> {
        println!("Shutting down {} server for {}", self.language, self.root_path);
        // Wywołaj metodę shutdown na wewnętrznym serwerze
        if let Err(e) = self.server.shutdown().await {
            eprintln!("Error shutting down server: {:?}", e);
        }
        Ok(())
    }
    
    fn get_capabilities(&self) -> Value {
        // Próba uzyskania rzeczywistych capabilities z RustLanguageServer
        println!("Pobieranie capabilities dla serwera Rust w projekcie: {}", self.root_path);
        
        // Utwórz domyślne InitializeParams aby wywołać initialize na serwerze
        let root_uri = match url::Url::from_file_path(&self.root_path) {
            Ok(uri) => uri,
            Err(e) => {
                let error_msg = format!("Nie można utworzyć URI z ścieżki: {} - błąd: {:?}", self.root_path, e);
                eprintln!("BŁĄD: {}", error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_uri_creation"
                });
            }
        };
        
        let mut params = InitializeParams::default();
        params.root_uri = Some(root_uri);
        params.capabilities = ClientCapabilities::default();
        
        // Utwórz runtime tokio do wywołania asynchronicznego
        let rt = match tokio::runtime::Runtime::new() {
            Ok(runtime) => runtime,
            Err(e) => {
                let error_msg = format!("Nie można utworzyć tokio runtime: {}", e);
                eprintln!("BŁĄD: {}", error_msg);
                return json!({
                    "error": error_msg,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_runtime_creation"
                });
            }
        };
        
        // Sklonuj serwer do użycia w bloku async
        let server_clone = self.server.clone();
        
        // Wywołaj initialize na serwerze
        let init_result = rt.block_on(async move {
            match server_clone.initialize(params).await {
                Ok(result) => Ok(result),
                Err(e) => {
                    let error_msg = format!("Błąd inicjalizacji serwera Rust: {:?}", e);
                    eprintln!("BŁĄD: {}", error_msg);
                    Err(error_msg)
                }
            }
        });
        
        match init_result {
            Ok(result) => {
                // Serializuj wynik do JSON
                match serde_json::to_value(result.capabilities) {
                    Ok(json_value) => json_value,
                    Err(e) => {
                        let error_msg = format!("Nie można zserializować capabilities do JSON: {}", e);
                        eprintln!("BŁĄD: {}", error_msg);
                        json!({
                            "error": error_msg,
                            "_type": "capabilities_error",
                            "source": "rust_lsp_adapter_serialization"
                        })
                    }
                }
            },
            Err(e) => {
                json!({
                    "error": e,
                    "_type": "capabilities_error",
                    "source": "rust_lsp_adapter_initialization"
                })
            }
        }
    }
}

#[async_trait]
impl LanguageServer for LanguageServerInstance {
    async fn initialize(&self, params: InitializeParams) -> LspResult<InitializeResult> {
        match self {
            LanguageServerInstance::Rust(server) => server.initialize(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn initialized(&self, params: InitializedParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.initialized(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn shutdown(&self) -> LspResult<()> {
        match self {
            LanguageServerInstance::Rust(server) => server.shutdown().await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_open(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_change(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_save(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        match self {
            LanguageServerInstance::Rust(server) => server.did_close(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    // Definiujemy również pozostałe metody z traitu LanguageServer, które mogą być wymagane
    
    async fn completion(&self, params: CompletionParams) -> LspResult<Option<CompletionResponse>> {
        match self {
            LanguageServerInstance::Rust(server) => server.completion(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn hover(&self, params: HoverParams) -> LspResult<Option<Hover>> {
        match self {
            LanguageServerInstance::Rust(server) => server.hover(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn goto_definition(&self, params: GotoDefinitionParams) -> LspResult<Option<GotoDefinitionResponse>> {
        match self {
            LanguageServerInstance::Rust(server) => server.goto_definition(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn references(&self, params: ReferenceParams) -> LspResult<Option<Vec<Location>>> {
        match self {
            LanguageServerInstance::Rust(server) => server.references(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
    
    async fn formatting(&self, params: DocumentFormattingParams) -> LspResult<Option<Vec<TextEdit>>> {
        match self {
            LanguageServerInstance::Rust(server) => server.formatting(params).await,
            // Dodaj więcej implementacji dla innych serwerów w przyszłości
        }
    }
} 
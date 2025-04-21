use std::sync::Arc;
use std::net::SocketAddr;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, Mutex};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_stream::wrappers::TcpListenerStream;

use crate::lsp::server_factory::ServerFactory;
use crate::lsp::get_supported_languages;
use serde::{Deserialize, Serialize};
use anyhow::Result;

/// Struktura przechowująca połączenia WebSocket
pub struct WebSocketManager {
    server_factory: ServerFactory,
    clients: Arc<Mutex<Vec<mpsc::UnboundedSender<Message>>>>,
}

/// Typy wiadomości, które mogą być wysyłane przez WebSocket
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LspRequest {
    Initialize { language: String, root_path: String },
    Completion { file_path: String, position: Position },
    Hover { file_path: String, position: Position },
    Definition { file_path: String, position: Position },
    References { file_path: String, position: Position },
    Diagnostics { file_path: String },
    Formatting { file_path: String },
}

/// Typy odpowiedzi, które mogą być wysyłane przez serwer
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LspResponse {
    Initialized { success: bool, message: String },
    Completion { items: Vec<CompletionItem> },
    Hover { contents: Option<String> },
    Definition { location: Option<Location> },
    References { locations: Vec<Location> },
    Diagnostics { items: Vec<DiagnosticItem> },
    Formatting { edits: Vec<TextEdit> },
    Error { message: String },
}

/// Pozycja w pliku
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

/// Lokalizacja w pliku
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Location {
    pub file_path: String,
    pub range: Range,
}

/// Zakres tekstu
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

/// Element uzupełniania kodu
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionItem {
    pub label: String,
    pub kind: String,
    pub detail: Option<String>,
    pub documentation: Option<String>,
}

/// Element diagnostyki
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiagnosticItem {
    pub message: String,
    pub severity: String,
    pub range: Range,
}

/// Edycja tekstu
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextEdit {
    pub range: Range,
    pub new_text: String,
}

impl WebSocketManager {
    /// Tworzy nowy manager WebSocketów
    pub fn new() -> Self {
        Self {
            server_factory: ServerFactory::new(),
            clients: Arc::new(Mutex::new(Vec::new())),
        }
    }
    
    /// Uruchamia serwer WebSocket na podanym porcie
    pub async fn start_server(&self, port: u16) -> Result<()> {
        // Sprawdź, czy port jest wolny
        let socket_addr: SocketAddr = ([127, 0, 0, 1], port).into();
        
        println!("Próba uruchomienia serwera WebSocket LSP na porcie {}", port);
        
        // Najpierw sprawdź, czy port jest zajęty
        match tokio::net::TcpListener::bind(socket_addr).await {
            Ok(listener) => {
                let clients = self.clients.clone();
                let server_factory = self.server_factory.clone();
                
                // Zdefiniuj trasę WebSocket
                let ws_route = warp::path("lsp")
                    .and(warp::ws())
                    .map(move |ws: warp::ws::Ws| {
                        let clients = clients.clone();
                        let server_factory = server_factory.clone();
                        
                        ws.on_upgrade(move |socket| {
                            Self::handle_connection(socket, clients, server_factory)
                        })
                    });
                
                println!("Uruchomiono serwer WebSocket LSP na porcie {}", port);
                
                // Konwertujemy tokio TcpListener na właściwy format akceptowany przez warp
                let incoming = TcpListenerStream::new(listener);
                warp::serve(ws_route).run_incoming(incoming).await;
                
                Ok(())
            },
            Err(e) => {
                eprintln!("Nie można uruchomić serwera WebSocket na porcie {}: {}", port, e);
                Err(anyhow::anyhow!("Nie można uruchomić serwera WebSocket: {}", e))
            }
        }
    }
    
    /// Zamyka wszystkie połączenia WebSocket
    pub async fn stop_server(&self) -> Result<()> {
        // Pobierz wszystkie połączenia klientów
        let mut clients = self.clients.lock().await;
        
        // Wyślij wiadomość zamknięcia do wszystkich klientów
        for client in clients.iter_mut() {
            // Przygotuj wiadomość o zamknięciu
            let close_message = Message::close_with(CloseCode::Normal, "Server shutting down");
            
            // Spróbuj wysłać komunikat zamknięcia
            if let Err(e) = client.send(close_message) {
                eprintln!("Błąd przy zamykaniu połączenia WebSocket: {}", e);
            }
        }
        
        // Wyczyść listę klientów
        clients.clear();
        
        println!("WebSocket LSP server zatrzymany");
        Ok(())
    }
    
    /// Obsługuje nowe połączenie WebSocket
    async fn handle_connection(
        ws: WebSocket,
        clients: Arc<Mutex<Vec<mpsc::UnboundedSender<Message>>>>,
        server_factory: ServerFactory,
    ) {
        println!("Nowe połączenie WebSocket LSP");
        
        // Podziel gniazdo na nadajnik i odbiornik
        let (mut ws_tx, mut ws_rx) = ws.split();
        
        // Utwórz kanał komunikacyjny
        let (tx, mut rx) = mpsc::unbounded_channel();
        
        // Zarejestruj nowego klienta
        clients.lock().await.push(tx.clone());
        
        // Uruchom task przekazujący wiadomości z kanału rx do klienta WebSocket
        let forward_task = tokio::task::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = ws_tx.send(msg).await {
                    eprintln!("Błąd przy przekazywaniu wiadomości do WebSocket: {}", e);
                    break;
                }
            }
        });
        
        // Odbieraj wiadomości z WebSocket
        let server_factory_clone = server_factory.clone();
        let backward_task = tokio::task::spawn(async move {
            // Aktywny serwer LSP dla tego klienta
            let mut active_server = None;
            
            while let Some(result) = ws_rx.next().await {
                match result {
                    Ok(msg) => {
                        if msg.is_text() || msg.is_binary() {
                            let response = Self::handle_message(msg, &server_factory_clone, &mut active_server).await;
                            if let Ok(response_msg) = response {
                                if !response_msg.as_bytes().is_empty() {
                                    if let Err(e) = tx.send(response_msg) {
                                        eprintln!("Błąd przy wysyłaniu odpowiedzi: {}", e);
                                        break;
                                    }
                                }
                            }
                        } else if msg.is_close() {
                            // Zamknij aktywny serwer LSP, jeśli istnieje
                            if let Some(server_id) = active_server.take() {
                                if let Err(e) = server_factory_clone.stop_server(server_id).await {
                                    eprintln!("Błąd przy zatrzymywaniu serwera LSP: {}", e);
                                }
                            }
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("Błąd WebSocket: {}", e);
                        break;
                    }
                }
            }
            
            // Klient się rozłączył, zatrzymaj serwer LSP
            if let Some(server_id) = active_server {
                if let Err(e) = server_factory_clone.stop_server(server_id).await {
                    eprintln!("Błąd przy zatrzymywaniu serwera LSP: {}", e);
                }
            }
            
            println!("Klient WebSocket LSP rozłączony");
        });
        
        // Poczekaj na zakończenie obu tasków
        tokio::select! {
            _ = forward_task => {},
            _ = backward_task => {},
        }
    }
    
    /// Obsługuje wiadomość od klienta
    async fn handle_message(
        msg: Message, 
        server_factory: &ServerFactory, 
        active_server: &mut Option<String>
    ) -> Result<Message> {
        if let Ok(text) = msg.to_str() {
            println!("Otrzymano wiadomość: {}", text);
            
            // Próbujemy zinterpretować wiadomość jako JSON-RPC
            match serde_json::from_str::<serde_json::Value>(text) {
                Ok(json_rpc) => {
                    // Przygotuj domyślną wartość id dla błędów
                    let id_value = json_rpc.get("id").cloned().unwrap_or(serde_json::Value::Null);
                    
                    // Sprawdź, czy to poprawne żądanie JSON-RPC
                    if json_rpc.is_object() {
                        let jsonrpc = json_rpc.get("jsonrpc");
                        let method = json_rpc.get("method");
                        let id = json_rpc.get("id");
                        let params = json_rpc.get("params");
                        
                        // Walidacja wersji JSON-RPC
                        if let Some(jsonrpc_value) = jsonrpc {
                            if jsonrpc_value.as_str() != Some("2.0") {
                                // Nieprawidłowa wersja JSON-RPC
                                let error_response = serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": id.cloned().unwrap_or(serde_json::Value::Null),
                                    "error": {
                                        "code": -32600,
                                        "message": "Invalid JSON-RPC version. Expected 2.0"
                                    }
                                });
                                return Ok(Message::text(error_response.to_string()));
                            }
                        } else {
                            // Brak wersji JSON-RPC
                            let error_response = serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": id.cloned().unwrap_or(serde_json::Value::Null),
                                "error": {
                                    "code": -32600,
                                    "message": "Missing JSON-RPC version"
                                }
                            });
                            return Ok(Message::text(error_response.to_string()));
                        }
                        
                        // Sprawdź, czy to żądanie czy powiadomienie
                        if let Some(method_value) = method {
                            // To jest metoda JSON-RPC
                            let method_name = method_value.as_str().unwrap_or("");
                            
                            match method_name {
                                // Obsługa metody initialize
                                "initialize" if id.is_some() => {
                                    println!("Otrzymano żądanie initialize");
                                    
                                    // Pobierz parametry inicjalizacji z JSON
                                    let params_value = match params {
                                        Some(value) => value.clone(),
                                        None => {
                                            println!("Brak parametrów w żądaniu initialize");
                                            let error_response = serde_json::json!({
                                                "jsonrpc": "2.0",
                                                "id": id.unwrap_or(&serde_json::Value::Null).clone(),
                                                "error": {
                                                    "code": -32602,
                                                    "message": "Invalid params: params is required for initialize"
                                                }
                                            });
                                            return Ok(Message::text(error_response.to_string()));
                                        }
                                    };
                                    
                                    // Pobierz path z parametrów
                                    let file_path = params_value.get("rootUri")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .trim_start_matches("file://")
                                        .to_string();
                                    
                                    // Pobierz język z parametrów
                                    let language = params_value.get("initializationOptions")
                                        .and_then(|v| v.get("language"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("unknown")
                                        .to_string();
                                    
                                    println!("Inicjalizacja dla języka: {}, ścieżka pliku: {}", language, file_path);
                                    
                                    // Najpierw próbujmy użyć języka z parametrów
                                    let mut final_language = language.clone();
                                    
                                    // Jeśli język jest nieznany lub pusty, spróbuj go wykryć
                                    if final_language == "unknown" || final_language.is_empty() {
                                        // Sprawdź, czy można lepiej określić język na podstawie rozszerzeń plików w katalogu
                                        if let Some(detected_language) = Self::detect_language_from_file_extension(&file_path) {
                                            println!("Automatycznie wykryto język: {} na podstawie rozszerzenia pliku lub zawartości katalogu", detected_language);
                                            final_language = detected_language;
                                        } else {
                                            println!("Nie udało się wykryć języka automatycznie, próbuję użyć języka z parametrów: {}", language);
                                        }
                                    }
                                    
                                    // Sprawdź, czy język jest obsługiwany
                                    let supported_languages = get_supported_languages();
                                    if !supported_languages.contains(&final_language.as_str()) {
                                        println!("Język {} nie jest obsługiwany przez serwer LSP", final_language);
                                        
                                        let error_response = serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": id.unwrap_or(&serde_json::Value::Null).clone(),
                                            "error": {
                                                "code": -32601,
                                                "message": format!("Język '{}' nie jest obsługiwany. Aktualnie obsługiwane języki to: {}", 
                                                                  final_language, supported_languages.join(", "))
                                            }
                                        });
                                        
                                        return Ok(Message::text(error_response.to_string()));
                                    }
                                    
                                    // Wypisz ostateczny język używany do inicjalizacji
                                    println!("Używam języka do inicjalizacji: {}", final_language);
                                    
                                    // Znajdź poprawny katalog główny projektu używając ServerFactory
                                    match server_factory.find_project_root(&final_language, &file_path) {
                                        Ok(correct_root_path) => {
                                            println!("Znaleziono poprawny katalog główny projektu: {}", correct_root_path);
                                            
                                            // Zaktualizuj parametry initializacji z poprawnym rootUri
                                            let mut updated_params = params_value.clone();
                                            
                                            // Utwórz poprawny URI dla katalogu głównego
                                            let correct_root_uri = format!("file://{}", correct_root_path);
                                            
                                            // Zaktualizuj parametry
                                            if let Some(obj) = updated_params.as_object_mut() {
                                                obj.insert("rootUri".to_string(), serde_json::Value::String(correct_root_uri.clone()));
                                                // Aktualizuj również rootPath dla zgodności
                                                obj.insert("rootPath".to_string(), serde_json::Value::String(correct_root_path.clone()));
                                                
                                                // Upewnij się, że initializationOptions zawiera język
                                                if !obj.contains_key("initializationOptions") {
                                                    obj.insert("initializationOptions".to_string(), 
                                                             serde_json::json!({ "language": final_language }));
                                                } else if let Some(init_options) = obj.get_mut("initializationOptions") {
                                                    if let Some(obj) = init_options.as_object_mut() {
                                                        // Zaktualizuj język w istniejących options
                                                        obj.insert("language".to_string(), 
                                                                 serde_json::Value::String(final_language.clone()));
                                                    }
                                                }
                                            }
                                            
                                            println!("Zaktualizowany rootUri: {}", correct_root_uri);
                                            
                                            // Upewnij się, że używamy ścieżki pliku a nie katalogu dla utworzenia serwera
                                            // jeśli otrzymaliśmy ścieżkę do katalogu a nie pliku
                                            let server_path = if std::path::Path::new(&file_path).is_dir() {
                                                // Jeśli to katalog, użyj katalogu głównego do inicjalizacji
                                                correct_root_path.clone()
                                            } else {
                                                // Jeśli to plik, użyj ścieżki pliku
                                                file_path.clone()
                                            };
                                            
                                            // Uruchom serwer LSP dla danego języka z poprawnym katalogiem głównym
                                            let server_result = server_factory.create_server(&final_language, &server_path).await;
                                            
                                            match server_result {
                                                Ok(server_id) => {
                                                    // Zapisz ID serwera w zmiennej active_server
                                                    *active_server = Some(server_id.clone());
                                                    
                                                    println!("Utworzono serwer LSP. ID: {}", server_id);
                                                    
                                                    // Zaktualizuj żądanie z poprawionymi parametrami
                                                    let mut updated_json_rpc = json_rpc.clone();
                                                    if let Some(obj) = updated_json_rpc.as_object_mut() {
                                                        obj.insert("params".to_string(), updated_params);
                                                    }
                                                    
                                                    // Przekaż zaktualizowane żądanie do serwera LSP
                                                    let request_text = serde_json::to_string(&updated_json_rpc)?;
                                                    
                                                    // Nie używaj block_on wewnątrz istniejącego runtime Tokio
                                                    match server_factory.forward_request(&server_id, &request_text).await {
                                                        Ok(response_text) => {
                                                            println!("Wysyłam odpowiedź initialize z serwera: {}", response_text);
                                                            return Ok(Message::text(response_text));
                                                        },
                                                        Err(e) => {
                                                            // Błąd przekazania żądania
                                                            eprintln!("Błąd podczas inicjalizacji serwera: {}", e);
                                                            let id_value = id.unwrap().clone();
                                                            let error_response = serde_json::json!({
                                                                "jsonrpc": "2.0",
                                                                "id": id_value,
                                                                "error": {
                                                                    "code": -32603,
                                                                    "message": format!("Błąd inicjalizacji serwera LSP: {}", e)
                                                                }
                                                            });
                                                            
                                                            return Ok(Message::text(error_response.to_string()));
                                                        }
                                                    }
                                                },
                                                Err(e) => {
                                                    // Błąd inicjalizacji serwera LSP
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("Błąd tworzenia serwera LSP: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                }
                                            }
                                        },
                                        Err(e) => {
                                            // Błąd znalezienia katalogu głównego projektu
                                            eprintln!("Błąd znalezienia katalogu głównego projektu: {}", e);
                                            
                                            // Kontynuuj z oryginalną ścieżką jako fallback
                                            println!("Używanie oryginalnej ścieżki jako fallback: {}", file_path);
                                            
                                            // Uruchom serwer LSP dla danego języka
                                            let server_result = server_factory.create_server(&final_language, &file_path).await;
                                            
                                            // Dalsza obsługa jak poprzednio...
                                            match server_result {
                                                Ok(server_id) => {
                                                    // Zapisz aktywny serwer
                                                    *active_server = Some(server_id.clone());
                                                    
                                                    // Przekaż żądanie initialize bezpośrednio do serwera LSP
                                                    // To wywołanie powinno zwrócić faktyczne capabilities serwera
                                                    let forward_result = server_factory.forward_request(&server_id, text).await;
                                                    
                                                    match forward_result {
                                                        Ok(response_text) => {
                                                            println!("Wysyłam odpowiedź initialize z serwera: {}", response_text);
                                                            return Ok(Message::text(response_text));
                                                        },
                                                        Err(e) => {
                                                            // Błąd przekazania żądania
                                                            eprintln!("Błąd podczas inicjalizacji serwera: {}", e);
                                                            let id_value = id.unwrap().clone();
                                                            let error_response = serde_json::json!({
                                                                "jsonrpc": "2.0",
                                                                "id": id_value,
                                                                "error": {
                                                                    "code": -32603,
                                                                    "message": format!("Błąd inicjalizacji serwera LSP: {}", e)
                                                                }
                                                            });
                                                            
                                                            return Ok(Message::text(error_response.to_string()));
                                                        }
                                                    }
                                                },
                                                Err(e) => {
                                                    // Błąd inicjalizacji serwera LSP
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("Błąd tworzenia serwera LSP: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                }
                                            }
                                        }
                                    }
                                },
                                
                                // Obsługa powiadomienia initialized
                                "initialized" => {
                                    println!("Otrzymano powiadomienie initialized");
                                    
                                    // Przekaż powiadomienie initialized do serwera
                                    if let Some(server_id) = active_server {
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        match forward_result {
                                            Ok(_) => {
                                                // Dla powiadomień bez id nie wysyłamy odpowiedzi
                                                return Ok(Message::text(""));
                                            },
                                            Err(e) => {
                                                // Błąd przekazania powiadomienia - logujemy, ale nie zwracamy odpowiedzi
                                                eprintln!("Błąd przekazania powiadomienia initialized: {}", e);
                                                return Ok(Message::text(""));
                                            }
                                        }
                                    } else {
                                        eprintln!("Otrzymano powiadomienie initialized, ale serwer nie jest zainicjalizowany");
                                        return Ok(Message::text(""));
                                    }
                                },
                                
                                // Obsługa żądania otwarcia dokumentu
                                "textDocument/didOpen" => {
                                    println!("Otrzymano powiadomienie didOpen");
                                    
                                    // Spróbuj wyekstrahować informacje o języku z parametrów
                                    let mut language_id = "generic".to_string();
                                    let mut file_uri = "".to_string();
                                    
                                    if let Some(params) = json_rpc.get("params") {
                                        if let Some(text_doc) = params.get("textDocument") {
                                            if let Some(lang_id) = text_doc.get("languageId") {
                                                if let Some(lang_str) = lang_id.as_str() {
                                                    println!("Zadeklarowany język dokumentu w didOpen: {}", lang_str);
                                                    language_id = lang_str.to_string();
                                                }
                                            }
                                            if let Some(uri) = text_doc.get("uri") {
                                                if let Some(uri_str) = uri.as_str() {
                                                    println!("URI dokumentu w didOpen: {}", uri_str);
                                                    file_uri = uri_str.to_string();
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Jeśli język jest "generic" lub "plaintext", spróbuj wykryć język na podstawie rozszerzenia pliku
                                    if language_id == "generic" || language_id == "plaintext" || language_id.is_empty() {
                                        // Usuń przedrostek file:// jeśli istnieje
                                        let file_path = if file_uri.starts_with("file://") {
                                            file_uri[7..].to_string()
                                        } else {
                                            file_uri.clone()
                                        };
                                        
                                        // Wydrukuj pełne informacje o pliku przed detekcją
                                        println!("Analizuję plik: '{}' o deklarowanym języku: '{}'", file_path, language_id);
                                        
                                        // Wykryj język na podstawie rozszerzenia pliku
                                        let detected_language_option = Self::detect_language_from_file_extension(&file_path);
                                        
                                        match detected_language_option {
                                            Some(detected_language) => {
                                                println!("Wykryto język na podstawie rozszerzenia pliku: {} zamiast {}", 
                                                         detected_language, language_id);
                                                
                                                // Aktualizujemy zmienną lokalną language_id
                                                language_id = detected_language;
                                                
                                                // Sprawdź, czy język jest obsługiwany
                                                let supported_languages = get_supported_languages();
                                                if !supported_languages.contains(&language_id.as_str()) {
                                                    println!("Język {} nie jest obsługiwany przez serwer LSP", language_id);
                                                    return Ok(Message::text(""));
                                                }
                                                
                                                // Sprawdź, czy mamy aktywny serwer i czy jest to odpowiedni typ serwera
                                                if let Some(_server_id) = active_server {
                                                    println!("Sprawdzam, czy obecnie używamy właściwego serwera dla języka: {}", language_id);
                                                    
                                                    // Jeśli wykryliśmy Rust, sprawdź, czy potrzebujemy stworzyć nowy serwer Rust
                                                    if language_id == "rust" {
                                                        // Tu możemy zdecydować, czy stworzyć nowy dedykowany serwer
                                                        // lub przekazać do istniejącego
                                                        println!("Wykryto plik Rust - upewniamy się, że mamy odpowiedni serwer");
                                                    }
                                                }
                                                
                                                // Tworzymy nowy tekst żądania zamiast modyfikować oryginalny
                                                let mut modified_json_rpc = json_rpc.clone();
                                                
                                                if let Some(params) = modified_json_rpc.get_mut("params") {
                                                    if let Some(text_doc) = params.get_mut("textDocument") {
                                                        if let Some(lang_obj) = text_doc.get_mut("languageId") {
                                                            *lang_obj = serde_json::Value::String(language_id.clone());
                                                            println!("Zaktualizowano didOpen z wykrytym językiem: {}", language_id);
                                                        }
                                                    }
                                                }
                                                
                                                // Sprawdź, czy mamy aktywny serwer
                                                if let Some(server_id) = active_server {
                                                    // Przekształć zmodyfikowane JSON-RPC na tekst
                                                    let modified_text = serde_json::to_string(&modified_json_rpc)
                                                        .unwrap_or_else(|_| text.to_string());
                                                    
                                                    // Przekaż zmodyfikowane powiadomienie do serwera
                                                    let forward_result = server_factory.forward_request(server_id, &modified_text).await;
                                                    
                                                    // Dla powiadomień didOpen nie oczekujemy odpowiedzi
                                                    if let Err(e) = forward_result {
                                                        eprintln!("Błąd przekazania didOpen: {}", e);
                                                    }
                                                    
                                                    // Powiadomienia nie wymagają odpowiedzi
                                                    return Ok(Message::text(""));
                                                } else {
                                                    // Brak aktywnego serwera, spróbuj utworzyć nowy
                                                    println!("Brak aktywnego serwera LSP, próbuję utworzyć nowy dla: {}", language_id);
                                                    
                                                    // Usuń przedrostek file:// jeśli istnieje
                                                    let file_path = if file_uri.starts_with("file://") {
                                                        file_uri[7..].to_string()
                                                    } else {
                                                        file_uri.clone()
                                                    };
                                                    
                                                    // Próba utworzenia nowego serwera dla wykrytego języka
                                                    match server_factory.create_server(&language_id, &file_path).await {
                                                        Ok(server_id) => {
                                                            // Zapisz ID serwera
                                                            *active_server = Some(server_id.clone());
                                                            println!("Utworzono nowy serwer LSP dla: {}. ID: {}", language_id, server_id);
                                                            
                                                            // Przekaż zmodyfikowane powiadomienie do nowego serwera
                                                            let modified_text = serde_json::to_string(&modified_json_rpc)
                                                                .unwrap_or_else(|_| text.to_string());
                                                            
                                                            let forward_result = server_factory.forward_request(&server_id, &modified_text).await;
                                                            
                                                            if let Err(e) = forward_result {
                                                                eprintln!("Błąd przekazania didOpen do nowego serwera: {}", e);
                                                            }
                                                        },
                                                        Err(e) => {
                                                            eprintln!("Nie można utworzyć serwera LSP dla: {}. Błąd: {}", language_id, e);
                                                        }
                                                    }
                                                    
                                                    return Ok(Message::text(""));
                                                }
                                            },
                                            None => {
                                                println!("Nie wykryto języka na podstawie rozszerzenia pliku dla: {}", file_path);
                                            }
                                        }
                                    }
                                    
                                    if let Some(server_id) = active_server {
                                        // Przekaż oryginalne powiadomienie do serwera
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        // Dla powiadomień didOpen nie oczekujemy odpowiedzi
                                        if let Err(e) = forward_result {
                                            eprintln!("Błąd przekazania didOpen: {}", e);
                                        }
                                        
                                        // Powiadomienia nie wymagają odpowiedzi
                                        return Ok(Message::text(""));
                                    } else {
                                        eprintln!("Otrzymano didOpen, ale serwer nie jest zainicjalizowany");
                                        return Ok(Message::text(""));
                                    }
                                },
                                
                                // Pozostałe metody przekazujemy do aktywnego serwera LSP
                                _ => {
                                    if let Some(server_id) = active_server {
                                        // Przekaż żądanie do aktywnego serwera LSP
                                        let forward_result = server_factory.forward_request(server_id, text).await;
                                        
                                        match forward_result {
                                            Ok(response_text) => {
                                                return Ok(Message::text(response_text));
                                            },
                                            Err(e) => {
                                                // Błąd przekazania żądania
                                                if id.is_some() {
                                                    let id_value = id.unwrap().clone();
                                                    let error_response = serde_json::json!({
                                                        "jsonrpc": "2.0",
                                                        "id": id_value,
                                                        "error": {
                                                            "code": -32603,
                                                            "message": format!("Błąd przekazania żądania: {}", e)
                                                        }
                                                    });
                                                    
                                                    return Ok(Message::text(error_response.to_string()));
                                                } else {
                                                    // Powiadomienie, nie wymaga odpowiedzi
                                                    return Ok(Message::text(""));
                                                }
                                            }
                                        }
                                    } else if id.is_some() {
                                        // Brak aktywnego serwera, zwróć błąd
                                        let id_value = id.unwrap().clone();
                                        let error_response = serde_json::json!({
                                            "jsonrpc": "2.0",
                                            "id": id_value,
                                            "error": {
                                                "code": -32603,
                                                "message": "Serwer LSP nie został zainicjalizowany"
                                            }
                                        });
                                        
                                        return Ok(Message::text(error_response.to_string()));
                                    } else {
                                        // Powiadomienie, nie wymaga odpowiedzi
                                        return Ok(Message::text(""));
                                    }
                                }
                            }
                        }
                    }
                    
                    // Nieprawidłowe żądanie JSON-RPC
                    let error_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id_value,
                        "error": {
                            "code": -32600,
                            "message": "Invalid Request"
                        }
                    });
                    
                    Ok(Message::text(error_response.to_string()))
                },
                Err(e) => {
                    // Błąd deserializacji JSON
                    let error_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": null,
                        "error": {
                            "code": -32700,
                            "message": format!("Parse error: {}", e)
                        }
                    });
                    
                    Ok(Message::text(error_response.to_string()))
                }
            }
        } else {
            // Nie można przekonwertować wiadomości na tekst
            let error_response = serde_json::json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": {
                    "code": -32700,
                    "message": "Parse error: Message is not text"
                }
            });
            
            Ok(Message::text(error_response.to_string()))
        }
    }

    /// Wykrywa język na podstawie rozszerzenia pliku
    /// Zwraca None, jeśli język nie został wykryty
    fn detect_language_from_file_extension(file_path: &str) -> Option<String> {
        use std::path::Path;
        
        // Znormalizuj ścieżkę - usuń potencjalne query parameters
        let clean_path = if file_path.contains('?') {
            file_path.split('?').next().unwrap_or(file_path)
        } else {
            file_path
        };
        
        // Wypisz debug info
        println!("Wykrywanie języka dla ścieżki: '{}'", clean_path);
        
        // Sprawdź czy ścieżka jest katalogiem
        let path = Path::new(clean_path);
        if path.is_dir() {
            println!("Ścieżka jest katalogiem, sprawdzam pliki projektu");
            
            // Sprawdź pliki projektu dla popularnych języków
            if path.join("Cargo.toml").exists() {
                println!("Wykryto projekt Rust (Cargo.toml)");
                return Some("rust".to_string());
            } else if path.join("package.json").exists() {
                println!("Wykryto projekt JavaScript/TypeScript (package.json)");
                // Sprawdź czy to TypeScript przez obecność tsconfig.json
                if path.join("tsconfig.json").exists() {
                    return Some("typescript".to_string());
                }
                return Some("javascript".to_string());
            } else if path.join("pyproject.toml").exists() || path.join("requirements.txt").exists() {
                println!("Wykryto projekt Python");
                return Some("python".to_string());
            }
            
            // Sprawdź czy katalog zawiera pliki źródłowe danego języka
            let entries = match std::fs::read_dir(path) {
                Ok(entries) => entries,
                Err(_) => return None,
            };
            
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Some(filename) = entry.file_name().to_str() {
                        if filename.ends_with(".rs") {
                            println!("Znaleziono plik .rs w katalogu");
                            return Some("rust".to_string());
                        } else if filename.ends_with(".py") {
                            return Some("python".to_string());
                        } else if filename.ends_with(".js") {
                            return Some("javascript".to_string());
                        } else if filename.ends_with(".ts") {
                            return Some("typescript".to_string());
                        }
                    }
                }
            }
            
            println!("Nie wykryto konkretnego typu projektu w katalogu");
            return None;
        }
        
        // Kontynuuj z rozpoznawaniem na podstawie rozszerzenia pliku
        let extension = clean_path.split('.').last().unwrap_or("");
        println!("Rozszerzenie pliku: '{}'", extension);
        
        match extension {
            "rs" => {
                println!("Wykryto plik Rust (.rs)");
                Some("rust".to_string())
            },
            "py" => Some("python".to_string()),
            "js" => Some("javascript".to_string()),
            "ts" => Some("typescript".to_string()),
            "cpp" | "h" | "c" | "cc" | "hh" => Some("cpp".to_string()),
            "java" => Some("java".to_string()),
            "kt" => Some("kotlin".to_string()),
            "go" => Some("go".to_string()),
            "sh" => Some("bash".to_string()),
            "md" => Some("markdown".to_string()),
            "html" => Some("html".to_string()),
            "css" => Some("css".to_string()),
            "rb" => Some("ruby".to_string()),
            "php" => Some("php".to_string()),
            "sql" => Some("sql".to_string()),
            "xml" => Some("xml".to_string()),
            "json" => Some("json".to_string()),
            "yaml" | "yml" => Some("yaml".to_string()),
            "toml" => Some("toml".to_string()),
            "ini" | "cfg" | "env" => Some("ini".to_string()),
            "bat" => Some("batch".to_string()),
            "ps1" | "psm1" | "psd1" => Some("powershell".to_string()),
            _ => {
                println!("Nie wykryto znanego rozszerzenia pliku");
                None
            }
        }
    }
}

impl Clone for ServerFactory {
    fn clone(&self) -> Self {
        Self::new()
    }
}

impl Clone for WebSocketManager {
    fn clone(&self) -> Self {
        Self {
            server_factory: self.server_factory.clone(),
            clients: self.clients.clone(),
        }
    }
} 

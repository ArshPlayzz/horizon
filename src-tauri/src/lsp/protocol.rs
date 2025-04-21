use lsp_types::{CompletionItem, CompletionItemKind, Documentation, MarkupContent, MarkupKind};
use tower_lsp::lsp_types::Url;
use anyhow::Result;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::process::{Child, ChildStdin, ChildStdout};
use std::io::{BufReader, Write, BufRead, Read};
use serde_json::{Value, json};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

// Struktura reprezentująca komunikat JSON-RPC
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

// Struktura reprezentująca odpowiedź JSON-RPC
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

// Struktura reprezentująca błąd JSON-RPC
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// Struktura reprezentująca powiadomienie JSON-RPC
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// Common utilities for LSP protocol implementation
pub trait LSPUtils {
    /// Converts a file path to a URI
    fn path_to_uri(path: &str) -> Result<Url> {
        let path = Path::new(path).canonicalize()?;
        let url = Url::from_file_path(path).map_err(|_| anyhow::anyhow!("Invalid file path"))?;
        Ok(url)
    }
    
    /// Converts a URI to a file path
    fn uri_to_path(uri: &Url) -> Result<String> {
        let path = uri.to_file_path()
            .map_err(|_| anyhow::anyhow!("Invalid URI"))?;
        let path_str = path.to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid path encoding"))?;
        Ok(path_str.to_string())
    }
    
    /// Creates a completion item with the given label and kind
    fn create_completion_item(label: &str, kind: Option<CompletionItemKind>, detail: Option<&str>, documentation: Option<&str>) -> CompletionItem {
        CompletionItem {
            label: label.to_string(),
            kind,
            detail: detail.map(|s| s.to_string()),
            documentation: documentation.map(|doc| Documentation::MarkupContent(MarkupContent {
                kind: MarkupKind::Markdown,
                value: doc.to_string(),
            })),
            ..Default::default()
        }
    }
}

/// Właściwa implementacja komunikacji JSON-RPC z procesem LSP
pub struct LspProcessConnection {
    stdin: Arc<Mutex<ChildStdin>>,
    next_id: AtomicU64,
    response_handlers: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<JsonRpcResponse>>>>,
}

// Implement Clone for LspProcessConnection
impl Clone for LspProcessConnection {
    fn clone(&self) -> Self {
        Self {
            stdin: self.stdin.clone(),
            next_id: AtomicU64::new(self.next_id.load(Ordering::SeqCst)),
            response_handlers: self.response_handlers.clone(),
        }
    }
}

impl LspProcessConnection {
    /// Tworzy nowe połączenie z procesem LSP
    pub fn new(process: &mut Child) -> Result<Self> {
        // Pobierz stdin i stdout procesu
        let stdin = process.stdin.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdin handle from process"))?;
        let stdout = process.stdout.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdout handle from process"))?;
        
        let stdin = Arc::new(Mutex::new(stdin));
        let response_handlers = Arc::new(Mutex::new(HashMap::new()));
        let next_id = AtomicU64::new(1);
        
        let connection = Self {
            stdin,
            next_id,
            response_handlers,
        };
        
        // Uruchom wątek odczytujący odpowiedzi z procesu
        let response_handlers_clone = connection.response_handlers.clone();
        std::thread::spawn(move || {
            Self::read_responses(stdout, response_handlers_clone);
        });
        
        Ok(connection)
    }
    
    /// Wysyła żądanie JSON-RPC do procesu LSP i czeka na odpowiedź
    pub async fn send_request<T: Serialize>(&self, method: &str, params: Option<T>) -> Result<JsonRpcResponse> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let id_value = json!(id);
        
        // Przygotuj żądanie JSON-RPC
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: id_value.clone(),
            method: method.to_string(),
            params: params.map(|p| serde_json::to_value(p).unwrap_or(Value::Null)),
        };
        
        // Serializuj żądanie do JSON
        let request_json = serde_json::to_string(&request)?;
        
        // Utwórz kanał do odebrania odpowiedzi
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.response_handlers.lock().unwrap().insert(id, tx);
        
        // Dodaj nagłówek Content-Length
        let message = format!("Content-Length: {}\r\n\r\n{}", request_json.len(), request_json);
        
        // Wyślij żądanie do procesu
        self.stdin.lock().unwrap().write_all(message.as_bytes())?;
        self.stdin.lock().unwrap().flush()?;
        
        println!("Wysłano żądanie LSP: {}", request_json);
        
        // Poczekaj na odpowiedź
        match rx.await {
            Ok(response) => {
                println!("Otrzymano odpowiedź LSP: {:?}", response);
                Ok(response)
            },
            Err(_) => Err(anyhow::anyhow!("Failed to receive response from LSP server"))
        }
    }
    
    /// Wysyła powiadomienie JSON-RPC do procesu LSP (bez oczekiwania na odpowiedź)
    pub fn send_notification<T: Serialize>(&self, method: &str, params: Option<T>) -> Result<()> {
        // Przygotuj powiadomienie JSON-RPC
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params: params.map(|p| serde_json::to_value(p).unwrap_or(Value::Null)),
        };
        
        // Serializuj powiadomienie do JSON
        let notification_json = serde_json::to_string(&notification)?;
        
        // Dodaj nagłówek Content-Length
        let message = format!("Content-Length: {}\r\n\r\n{}", notification_json.len(), notification_json);
        
        // Wyślij powiadomienie do procesu
        self.stdin.lock().unwrap().write_all(message.as_bytes())?;
        self.stdin.lock().unwrap().flush()?;
        
        println!("Wysłano powiadomienie LSP: {}", notification_json);
        
        Ok(())
    }
    
    /// Odczytuje odpowiedzi z procesu LSP i przekazuje je do odpowiednich handlerów
    fn read_responses(stdout: ChildStdout, response_handlers: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<JsonRpcResponse>>>>) {
        let mut reader = BufReader::new(stdout);
        let mut buffer = String::new();
        let mut content_length = 0;
        let mut reading_headers = true;
        
        loop {
            buffer.clear();
            match reader.read_line(&mut buffer) {
                Ok(0) => {
                    // EOF - proces zakończył się
                    println!("LSP process stdout closed");
                    break;
                },
                Ok(_) => {
                    // Przetwarzanie nagłówków lub treści
                    if reading_headers {
                        if buffer.trim().is_empty() {
                            if content_length == 0 {
                                // Brak nagłówka Content-Length
                                println!("Missing Content-Length header");
                                reading_headers = true;
                                continue;
                            }
                            
                            // Odczytaj treść wiadomości
                            let mut content = vec![0; content_length];
                            if let Err(e) = reader.read_exact(&mut content) {
                                println!("Failed to read response content: {}", e);
                                reading_headers = true;
                                continue;
                            }
                            
                            // Spróbuj sparsować odpowiedź
                            match String::from_utf8(content) {
                                Ok(content_str) => {
                                    match serde_json::from_str::<JsonRpcResponse>(&content_str) {
                                        Ok(response) => {
                                            if let Some(id) = response.id.as_u64() {
                                                // Przekaż odpowiedź do odpowiedniego handlera
                                                if let Some(handler) = response_handlers.lock().unwrap().remove(&id) {
                                                    // Ignoruj błąd, jeśli odbiorca nie czeka już na odpowiedź
                                                    let _ = handler.send(response);
                                                }
                                            }
                                        },
                                        Err(e) => {
                                            println!("Failed to parse LSP response: {}", e);
                                            println!("Response content: {}", content_str);
                                        }
                                    }
                                },
                                Err(e) => {
                                    println!("Invalid UTF-8 sequence in response: {}", e);
                                }
                            }
                            
                            // Wróć do odczytywania nagłówków
                            reading_headers = true;
                            content_length = 0;
                        } else if buffer.starts_with("Content-Length:") {
                            // Odczytaj długość treści
                            if let Some(len_str) = buffer.strip_prefix("Content-Length:") {
                                if let Ok(len) = len_str.trim().parse::<usize>() {
                                    content_length = len;
                                }
                            }
                        }
                    }
                },
                Err(e) => {
                    println!("Error reading from LSP process: {}", e);
                    break;
                }
            }
        }
    }
} 
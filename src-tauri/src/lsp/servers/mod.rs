pub mod rust;

use anyhow::Result;
use tower_lsp::LanguageServer;
use crate::lsp::config::ServerConfig;
use crate::lsp::protocol::LSPUtils;

/// Base trait for all language servers
pub trait BaseLanguageServer: LanguageServer + LSPUtils + Send + Sync {
    /// The unique identifier of this language server
    fn id(&self) -> &str;
    
    /// The human-readable name of this language server
    fn name(&self) -> &str;
    
    /// The configuration of this language server
    fn config(&self) -> &ServerConfig;
    
    /// Initialize a language server
    fn initialize(&self) -> Result<()>;
    
    /// Shut down a language server
    fn shutdown(&self) -> Result<()>;
    
    /// Check if the server is running
    fn is_running(&self) -> bool;
} 
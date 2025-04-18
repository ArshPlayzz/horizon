# Horizon

<div align="center">

> ⚠️ **Note:** This project is currently under active development and may contain bugs or incomplete features. Use at your own risk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-blue.svg)](https://tailwindcss.com)
[![CodeMirror](https://img.shields.io/badge/CodeMirror-6-blue.svg)](https://codemirror.net)

[![GitHub stars](https://img.shields.io/github/stars/66HEX/horizon?style=social)](https://github.com/66HEX/horizon/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/66HEX/horizon?style=social)](https://github.com/66HEX/horizon/network/members)
[![GitHub issues](https://img.shields.io/github/issues/66HEX/horizon)](https://github.com/66HEX/horizon/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/66HEX/horizon)](https://github.com/66HEX/horizon/pulls)

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/66HEX/horizon/releases)
[![Downloads](https://img.shields.io/github/downloads/66HEX/horizon/total)](https://github.com/66HEX/horizon/releases)
[![Release](https://img.shields.io/github/release/66HEX/horizon)](https://github.com/66HEX/horizon/releases/latest)

![Horizon Editor Screenshot](screen.png)

</div>


## Features

### Core Editor
- Application powered by Tauri
- Syntax highlighting for multiple programming languages
- UI built with Tailwind CSS and Radix UI components
- File and content search capabilities
- File system integration with directory navigation
- Integrated terminal with multi-instance support
- Dark theme for long coding sessions

### Terminal Integration
- Terminal implementation with native process management
- Support for multiple concurrent terminal instances
- Process tracking and management
- Persistent command history for improved workflow
- Cross-platform compatibility (Windows, macOS, Linux)
- Working directory synchronization
- Signal handling (SIGINT, SIGTERM)
- URL detection and handling
- ANSI escape sequence processing

### File Management
- File tree navigation system
- File and content search functionality
- File operations (open, save, save as)
- Directory structure representation
- Image file preview capabilities
- Audio file player
- Multiple file tab management

## Tech Stack

### Frontend
- React 18
- TypeScript
- Tailwind CSS
- Radix UI
- ShadCN
- CodeMirror 6

### Backend (Tauri/Rust)
- Tauri 2.0
- Rust
- sysinfo for process tracking
- tauri-plugin-fs for file system operations
- tauri-plugin-shell for terminal integration
- tauri-plugin-dialog for native dialogs
- tauri-plugin-process for process management

## Supported Languages
- JavaScript/TypeScript (js, jsx, ts, tsx)
- HTML/CSS
- Python
- Java
- C/C++
- Rust
- PHP
- SQL
- Markdown
- YAML
- JSON
- XML
- SASS/LESS
- Shell scripts
- And more...

## Getting Started

### Prerequisites
- Node.js (Latest LTS version)
- Rust (Latest stable version)
- Tauri CLI

### Installation

1. Clone the repository:
```bash
git clone https://github.com/66HEX/horizon.git
cd horizon
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run tauri dev
```

### Building for Production
```bash
npm run tauri build
```

## Project Structure

### Frontend (`src/`)
- `components/` - React components
  - `app-sidebar.tsx` - File navigation sidebar
  - `audio-player.tsx` - Audio playback component
  - `code-editor.tsx` - Main editor component 
  - `create-dialog.tsx` - Dialog for creating new files
  - `image-viewer.tsx` - Image preview component
  - `rename-dialog.tsx` - Dialog for renaming files
  - `terminal.tsx` - Custom terminal implementation
  - `theme-provider.tsx` - Theme management
- `lib/` - Core functionality
  - `file-context.tsx` - File management context
  - `file-service.ts` - File operations service
  - `native-fs.ts` - Native file system integration
  - `stores.ts` - State management stores
  - `utils.ts` - Utility functions
- `hooks/` - Custom React hooks
  - `use-mobile.ts` - Mobile detection hook
  - `use-theme.ts` - Theme management hook
- `App.tsx` - Main application component
- `main.tsx` - Application entry point

### Backend (`src-tauri/`)
- `src/`
  - `main.rs` - Application entry point
  - `lib.rs` - Library initialization
  - `terminal.rs` - Terminal management
  - `process_tracker.rs` - Process tracking
  - `fs.rs` - File system operations
- `capabilities/` - Tauri capabilities configuration
- `icons/` - Application icons
- `tauri.conf.json` - Tauri configuration
- `Cargo.toml` - Rust dependencies

## Roadmap

### High Priority
- [ ] LSP Server integration for enhanced language support
- [ ] Git integration with full GitHub support
- [ ] Settings panel with comprehensive configuration options
- [ ] Extensions and plugins system
- [ ] GitHub Actions autobuild pipeline

### Medium Priority
- [ ] AI-powered chat assistant for code help
- [ ] Debugging support with breakpoints and variable inspection
- [ ] Code analysis tools for better code quality
- [ ] Linting and Prettier integration
- [ ] Multiplayer collaboration features
- [ ] Integrated project management system - Not just a code editor, but also a tool for task and project management
- [ ] Advanced data visualization - Interactive charts, data structure visualizations, integrated notebooks
- [ ] Code presentation mode - Features that facilitate presenting and discussing code during meetings or recordings

### Low Priority
- [ ] Additional theme support and customization
- [ ] Advanced code refactoring tools
- [ ] Performance optimization
- [ ] Documentation improvements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Tauri team for the excellent desktop framework
- CodeMirror team for the powerful editor framework
- All contributors and supporters of the project
"use client"

import { useEffect, useRef, useState } from "react"
import { EditorState, StateEffect } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import { python } from "@codemirror/lang-python"
import { json } from "@codemirror/lang-json"
import { xml } from "@codemirror/lang-xml"
import { markdown } from "@codemirror/lang-markdown"
import { sql } from "@codemirror/lang-sql"
import { rust } from "@codemirror/lang-rust"
import { cpp } from "@codemirror/lang-cpp"
import { java } from "@codemirror/lang-java"
import { php } from "@codemirror/lang-php"
import { sass } from "@codemirror/lang-sass"
import { less } from "@codemirror/lang-less"
import { yaml } from "@codemirror/lang-yaml"
import { indentWithTab } from "@codemirror/commands"
import { lintKeymap, linter, Diagnostic as CMDiagnostic } from "@codemirror/lint"
import { EditorView, keymap, hoverTooltip, Tooltip } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { ScrollArea } from "./ui/scroll-area"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view"
import { bracketMatching, foldGutter } from "@codemirror/language"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import { useLspStore, CompletionItem as LspCompletionItem, DiagnosticItem } from "@/lib/lsp-store"
import { invoke } from "@tauri-apps/api/core"

const shadcnTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)"
  },
  ".cm-scroller": {
    overflow: "auto",
    overscrollBehavior: "contain"
  },
  ".cm-content": {
    caretColor: "var(--primary)"
  },
  ".cm-cursor": {
    borderLeftColor: "var(--primary)",
    borderLeftWidth: "2px"
  },
  ".cm-activeLine": {
    backgroundColor: "var(--muted)"
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--muted)"
  },
  ".cm-line": {
    padding: "0 3px",
    lineHeight: "1.6",
    fontFamily: "'Geist Mono', monospace",
    color: "var(--muted-foreground)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--muted)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--card)",
    color: "var(--muted-foreground)",
    border: "none",
    borderRight: "1px solid var(--border)"
  },
  ".cm-gutter": {
    minWidth: "3em",
    opacity: 0.8
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)"
  },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    "& > ul > li": {
      padding: "4px 8px"
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)"
    }
  }
}, { dark: true });

const shadcnHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--primary)", opacity: 0.9 },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic", opacity: 0.7 },
  { tag: t.string, color: "var(--chart-4)", opacity: 0.85 },
  { tag: t.number, color: "var(--chart-3)", opacity: 0.85 },
  { tag: t.operator, color: "var(--muted-foreground)", opacity: 0.9 },
  { tag: t.tagName, color: "var(--chart-1)", opacity: 0.85 },
  { tag: t.attributeName, color: "var(--chart-2)", opacity: 0.85 },
  { tag: t.className, color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.propertyName, color: "var(--chart-2)", opacity: 0.85 },
  { tag: t.variableName, color: "var(--muted-foreground)", opacity: 0.9 },
  { tag: t.function(t.variableName), color: "var(--chart-1)", opacity: 0.85 },
  { tag: t.typeName, color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.bool, color: "var(--chart-3)", opacity: 0.85 },
  { tag: t.definition(t.variableName), color: "var(--chart-5)", opacity: 0.85 },
  { tag: t.punctuation, color: "var(--muted-foreground)", opacity: 0.8 },
  { tag: t.heading, color: "var(--foreground)", fontWeight: "bold", opacity: 0.9 },
  { tag: t.link, color: "var(--primary)", textDecoration: "underline", opacity: 0.85 },
  { tag: t.emphasis, fontStyle: "italic", opacity: 0.85 },
  { tag: t.strong, fontWeight: "bold", opacity: 0.85 },
]);

export interface CodeEditorProps {
  initialValue: string
  onChange?: (content: string) => void
  language: string
  readOnly?: boolean
  onSave?: () => void
  className?: string
  filePath?: string
}

// Funkcja mapująca diagnostykę LSP na diagnostykę CodeMirror
function mapLspDiagnosticsToCM(diagnostics: DiagnosticItem[]): CMDiagnostic[] {
  return diagnostics.map(diag => ({
    from: diag.range.start.character,
    to: diag.range.end.character,
    severity: diag.severity === 'error' ? 'error' : 
             diag.severity === 'warning' ? 'warning' : 'info',
    message: diag.message
  }));
}

// Konwertuje pozycję kursora do formatu używanego przez LSP
function getCursorPosition(view: EditorView) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  
  return {
    line: line.number - 1, // LSP używa 0-bazowanego indeksowania linii
    character: pos - line.from // Pozycja znaku w linii
  };
}

function getEditorExtensions({
  language,
  readOnly,
  onChange,
  onSave,
  filePath,
}: {
  language: string;
  readOnly: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
  filePath?: string;
}) {
  let langExtension;
  switch (language) {
    case "html":
      langExtension = html();
      break;
    case "css":
      langExtension = css();
      break;
    case "javascript":
      langExtension = javascript();
      break;
    case "typescript":
      langExtension = javascript({ typescript: true });
      break;
    case "jsx":
      langExtension = javascript({ jsx: true });
      break;
    case "tsx":
      langExtension = javascript({ jsx: true, typescript: true });
      break;
    case "json":
      langExtension = json();
      break;
    case "python":
      langExtension = python();
      break;
    case "java":
      langExtension = java();
      break;
    case "rust":
      langExtension = rust();
      break;
    case "cpp":
    case "c++":
    case "c":
      langExtension = cpp();
      break;
    case "php":
      langExtension = php();
      break;
    case "xml":
      langExtension = xml();
      break;
    case "markdown":
    case "md":
      langExtension = markdown();
      break;
    case "sql":
      langExtension = sql();
      break;
    case "sass":
      langExtension = sass();
      break;
    case "less":
      langExtension = less();
      break;
    case "yaml":
      langExtension = yaml();
      break;
      
    default:
      langExtension = javascript({ typescript: true });
  }

  // LSP wsparcie - funkcja autouzupełniania
  const lspCompletion = (context: CompletionContext) => {
    const { state, pos } = context;
    const line = state.doc.lineAt(pos);
    const lineStart = line.from;
    const lineEnd = line.to;
    const cursorPos = pos - lineStart;

    // Pobierz serwis LSP
    const { getCompletions, currentFilePath } = useLspStore.getState();
    
    // Sprawdź, czy jesteśmy w prawidłowym pliku
    if (!filePath || filePath !== currentFilePath) {
      return null;
    }
    
    // Pobierz pozycję kursora w formacie LSP
    const lspPosition = {
      line: line.number - 1,
      character: cursorPos
    };
    
    // Asynchronicznie pobierz podpowiedzi z LSP
    return getCompletions(filePath, lspPosition).then(completions => {
      // Konwertuj podpowiedzi LSP na format CodeMirror
      const cmCompletions = completions.map(item => ({
        label: item.label,
        type: item.kind.toLowerCase(),
        detail: item.detail,
        info: item.documentation,
        apply: item.label
      }));
      
      // Pobierz pozycję, od której zaczyna się uzupełnienie
      const match = context.matchBefore(/[\w\d_\-\.]*/)
      const from = match ? lineStart + match.from : pos;
      
      return {
        from,
        options: cmCompletions
      };
    });
  };

  // LSP wsparcie - podpowiedzi podczas najechania myszą
  const lspHover = hoverTooltip(async (view, pos) => {
    const { getHoverInfo, currentFilePath } = useLspStore.getState();
    
    if (!filePath || filePath !== currentFilePath) {
      return null;
    }
    
    const line = view.state.doc.lineAt(pos);
    const lspPosition = {
      line: line.number - 1,
      character: pos - line.from
    };
    
    const hoverInfo = await getHoverInfo(filePath, lspPosition);
    
    if (!hoverInfo) {
      return null;
    }
    
    return {
      pos,
      create() {
        const dom = document.createElement('div');
        dom.textContent = hoverInfo.contents;
        dom.className = 'cm-lsp-hover';
        return { dom };
      }
    };
  });

  // LSP wsparcie - diagnostyka (lint)
  const lspLinter = linter(view => {
    const { diagnostics, currentFilePath } = useLspStore.getState();
    
    if (!filePath || filePath !== currentFilePath) {
      return [];
    }
    
    return mapLspDiagnosticsToCM(diagnostics);
  });

  return [
    readOnly ? EditorState.readOnly.of(true) : [],
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    langExtension,
    bracketMatching(),
    closeBrackets(),
    autocompletion({
      override: [lspCompletion]
    }),
    lspLinter,
    lspHover,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      ...searchKeymap,
      ...closeBracketsKeymap,
      indentWithTab
    ]),
    syntaxHighlighting(shadcnHighlightStyle),
    shadcnTheme,
    onChange ? EditorView.updateListener.of(update => {
      if (update.docChanged) {
        onChange(update.state.doc.toString())
      }
    }) : [],
    onSave ? keymap.of([{
      key: "Mod-s",
      run: () => {
        onSave()
        return true
      }
    }]) : [],
  ]
}

export function CodeEditor({
  initialValue,
  onChange,
  language,
  readOnly = false,
  onSave,
  className,
  filePath,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [documentVersion, setDocumentVersion] = useState(1)
  
  // Hook do inicjalizacji LSP dla aktualnego pliku
  const { 
    startLspServer, 
    isWebSocketRunning, 
    isServerRunning, 
    openDocument, 
    updateDocument, 
    closeDocument 
  } = useLspStore();
  
  // Obsługa aktualizacji pliku i inicjalizacji LSP dla określonego języka
  useEffect(() => {
    if (filePath && language && isWebSocketRunning) {
      
      // Użyj funkcji z backendu Rust do znalezienia katalogu głównego projektu
      const getProjectRoot = async (filePath: string, lang: string): Promise<string> => {
        try {
          // Wywołaj funkcję Rust przez API Tauri
          const rootPath = await invoke('find_project_root', { filePath, language: lang });
          console.log(`Found project root: ${rootPath} for file: ${filePath}, language: ${lang}`);
          return rootPath as string;
        } catch (error) {
          console.error('Error finding project root:', error);
          // Fallback: użyj katalogu pliku jako rootPath
          return filePath.substring(0, filePath.lastIndexOf('/'));
        }
      };
      
      // Rozpocznij inicjalizację LSP zgodnie ze standardem protokołu
      (async () => {
        try {
          // Znajdź katalog główny projektu
          const rootPath = await getProjectRoot(filePath, language);
          
          // Jeśli serwer LSP nie jest uruchomiony, zainicjuj go
          if (!isServerRunning) {
            await startLspServer(language, rootPath);
          }
          
          // Po inicjalizacji serwera otwórz dokument
          if (initialValue !== undefined) {
            await openDocument(filePath, language, initialValue);
            console.log(`Opened document: ${filePath}`);
          }
        } catch (err) {
          console.error(`Failed to initialize LSP for ${language}:`, err);
        }
      })();
    }
    
    // Przy odmontowaniu komponentu zamknij dokument
    return () => {
      if (filePath && isServerRunning) {
        closeDocument(filePath).catch(err => 
          console.error(`Error closing document ${filePath}:`, err)
        );
      }
    };
  }, [filePath, language, isWebSocketRunning, isServerRunning, startLspServer, openDocument, closeDocument, initialValue]);
  
  // Nasłuchuj zmian zawartości i powiadamiaj serwer LSP o zmianach
  useEffect(() => {
    if (onChange && filePath && isServerRunning) {
      const handleChange = (content: string) => {
        setDocumentVersion(version => {
          const newVersion = version + 1;
          // Powiadom LSP o zmianie zawartości dokumentu
          updateDocument(filePath, content, newVersion).catch(err => 
            console.error(`Error updating document ${filePath}:`, err)
          );
          return newVersion;
        });
        
        onChange(content);
      };
      
      if (editorView) {
        const changeListener = EditorView.updateListener.of(update => {
          if (update.docChanged) {
            handleChange(update.state.doc.toString());
          }
        });
        
        editorView.dispatch({
          effects: StateEffect.appendConfig.of(changeListener)
        });
        
        return () => {
          editorView.dispatch({
            effects: StateEffect.reconfigure.of([])
          });
        };
      }
    }
  }, [editorView, onChange, filePath, isServerRunning, updateDocument]);

  // Resetuj edytor gdy zmienia się filePath
  useEffect(() => {
    if (filePath) {
      // Zniszcz poprzedni widok edytora i utwórz nowy przy zmianie pliku
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
        setEditorView(null);
      }
      
      if (editorRef.current) {
        const state = EditorState.create({
          doc: initialValue,
          extensions: getEditorExtensions({
            language,
            readOnly,
            onChange,
            onSave,
            filePath,
          }),
        });

        const view = new EditorView({
          state,
          parent: editorRef.current,
        });

        viewRef.current = view;
        setEditorView(view);
      }
    }
    
    // Czyszczenie przy odmontowaniu komponentu
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [filePath, initialValue, language, readOnly, onChange, onSave, editorRef]);

  useEffect(() => {
    if (viewRef.current) {
      const currentExtensions = viewRef.current.state.facet(EditorView.contentAttributes)
      
      viewRef.current.dispatch({
        effects: StateEffect.reconfigure.of(getEditorExtensions({
          language,
          readOnly,
          onChange,
          onSave,
          filePath,
        }))
      })
    }
  }, [language, onChange, onSave, readOnly, filePath])

  const getLanguageLabel = (lang: string): string => {
    switch (lang.toLowerCase()) {
      case "html":
        return "HTML";
      case "css":
        return "CSS";
      case "javascript":
        return "JavaScript";
      case "typescript":
        return "TypeScript";
      case "jsx":
        return "JSX";
      case "tsx":
        return "TSX";
      case "json":
        return "JSON";
      case "python":
        return "Python";
      case "java":
        return "Java";
      case "rust":
        return "Rust";
      case "cpp":
      case "c++":
        return "C++";
      case "c":
        return "C";
      case "php":
        return "PHP";
      case "xml":
        return "XML";
      case "markdown":
      case "md":
        return "Markdown";
      case "sql":
        return "SQL";
      case "sass":
        return "SASS";
      case "less":
        return "LESS";
      case "yaml":
        return "YAML";
      default:
        return lang.charAt(0).toUpperCase() + lang.slice(1);
    }
  };

  return (
    <div className={cn("relative h-full w-full rounded-md border", className)}>
      <ScrollArea className="h-full">
        <div className="min-h-[100px] w-full">
          <div className="min-h-[100px] w-full" ref={editorRef} />
        </div>
      </ScrollArea>
    </div>
  )
} 
"use client"

import { useEffect, useRef, useState } from "react"
import { EditorState, StateEffect } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap } from "@codemirror/autocomplete"
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
import { lintKeymap } from "@codemirror/lint"
import { EditorView, keymap } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { ScrollArea } from "./ui/scroll-area"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { lineNumbers, highlightActiveLineGutter } from "@codemirror/view"
import { bracketMatching, foldGutter } from "@codemirror/language"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"

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
}

// Funkcja tworząca rozszerzenia dla edytora
function getEditorExtensions({
  language,
  readOnly,
  onChange,
  onSave,
}: {
  language: string;
  readOnly: boolean;
  onChange?: (content: string) => void;
  onSave?: () => void;
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

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    bracketMatching(),
    closeBrackets(),
    langExtension,
    shadcnTheme,
    syntaxHighlighting(shadcnHighlightStyle),
    autocompletion(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        console.log('Document changed', { 
          newContentLength: newContent.length,
          contentPreview: newContent.substring(0, 20) + '...',
          selection: update.state.selection,
          docChanged: update.docChanged
        });
        if (onChange) {
          console.log('Calling onChange handler');
          onChange(newContent);
        }
      }
      if (update.selectionSet) {
        console.log('Selection set', update.state.selection);
      }
      if (update.focusChanged) {
        console.log('Focus changed', { hasFocus: update.view.hasFocus });
      }
    }),
    EditorView.editable.of(!readOnly),
    EditorView.domEventHandlers({
      focus: (event, view) => {
        console.log('Editor focused');
        return false;
      },
      blur: () => {
        console.log('Editor blurred');
        return false;
      },
      keydown: (event) => {
        console.log('Key down in editor', { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          console.log('Save shortcut detected');
          if (onSave) {
            console.log('Calling onSave handler');
            onSave();
          }
          return true;
        }
        return false;
      }
    }),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...lintKeymap,
      ...closeBracketsKeymap,
      indentWithTab
    ])
  ];
}

export function CodeEditor({
  initialValue,
  onChange,
  language,
  readOnly = false,
  onSave,
  className,
}: CodeEditorProps) {
  // Track previous props values for comparison
  const prevPropsRef = useRef<CodeEditorProps>({
    initialValue: "",
    language: "",
    readOnly: false,
  });
  
  // Count renders
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  const editorViewRef = useRef<EditorView | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const [currentInitialValue, setCurrentInitialValue] = useState(initialValue);
  const didMountRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  
  // Aktualizuj referencje funkcji callback
  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);
  
  console.log('CodeEditor render', { 
    renderCount: renderCount.current,
    language, 
    readOnly, 
    initialValueLength: initialValue.length,
    initialValuePreview: initialValue.substring(0, 20) + '...',
    currentInitialValueLength: currentInitialValue.length,
    currentInitialValuePreview: currentInitialValue.substring(0, 20) + '...',
    prevProps: {
      language: prevPropsRef.current.language,
      readOnly: prevPropsRef.current.readOnly,
      initialValueLength: prevPropsRef.current.initialValue.length,
      initialValuePreview: prevPropsRef.current.initialValue.substring(0, 20) + '...',
    },
    isPropsChanged: {
      language: prevPropsRef.current.language !== language,
      readOnly: prevPropsRef.current.readOnly !== readOnly,
      initialValue: prevPropsRef.current.initialValue !== initialValue,
    },
    hasEditorView: Boolean(editorViewRef.current),
    didMount: didMountRef.current,
    cleanupStarted: cleanupStartedRef.current
  });
  
  // After render, update the previous props for next render comparison
  useEffect(() => {
    prevPropsRef.current = {
      initialValue,
      language,
      readOnly,
      onChange,
      onSave,
    };
  });

  // This effect will update the editor content when initialValue changes
  useEffect(() => {
    // Nie wykonuj operacji w trakcie czyszczenia komponentu
    if (cleanupStartedRef.current) return;
    
    console.log('initialValue effect triggered', { 
      initialValueLength: initialValue.length,
      initialValuePreview: initialValue.substring(0, 20) + '...',
      currentInitialValueLength: currentInitialValue.length,
      currentInitialValuePreview: currentInitialValue.substring(0, 20) + '...',
      hasEditorView: Boolean(editorViewRef.current),
      didInitialValueChange: initialValue !== currentInitialValue,
      didRefChange: initialValue !== initialValueRef.current,
      didMount: didMountRef.current,
      cleanupStarted: cleanupStartedRef.current
    });

    // Check if initialValue has changed
    if (initialValue !== currentInitialValue) {
      console.log('Updating currentInitialValue', {
        from: currentInitialValue.substring(0, 20) + '...',
        to: initialValue.substring(0, 20) + '...',
      });
      setCurrentInitialValue(initialValue);
      initialValueRef.current = initialValue;
      
      // Update editor content if view exists and content differs
      if (editorViewRef.current) {
        const currentContent = editorViewRef.current.state.doc.toString();
        
        console.log('Checking editor content vs initialValue', {
          currentContentLength: currentContent.length,
          initialValueLength: initialValue.length,
          contentDiffers: currentContent !== initialValue,
          contentLengthDiffers: currentContent.length !== initialValue.length,
        });
        
        if (currentContent !== initialValue) {
          console.log('Updating editor content from initialValue effect');
          editorViewRef.current.dispatch({
            changes: {
              from: 0,
              to: currentContent.length,
              insert: initialValue,
            },
          });
        }
      }
    }
  }, [initialValue, currentInitialValue]);

  // This effect will focus the editor when it's created
  useEffect(() => {
    // Nie wykonuj operacji w trakcie czyszczenia komponentu
    if (cleanupStartedRef.current) return;
    
    console.log('Focus effect', { 
      hasEditorView: Boolean(editorViewRef.current),
      hasEditorContainer: Boolean(editorContainerRef.current),
      didMount: didMountRef.current,
      cleanupStarted: cleanupStartedRef.current
    });
    
    if (editorViewRef.current && didMountRef.current) {
      console.log('Focusing editor');
      editorViewRef.current.focus();
    }
  }, [editorViewRef.current]);

  // Main setup effect - runs only once for initial setup and cleanup
  useEffect(() => {
    console.log('Setup effect', { 
      hasEditorView: Boolean(editorViewRef.current),
      hasEditorContainer: Boolean(editorContainerRef.current),
      language,
      readOnly,
      initialValueLength: initialValue.length,
      didMount: didMountRef.current,
      cleanupStarted: cleanupStartedRef.current
    });
    
    // Reset cleanup flag - nowy cykl montowania
    cleanupStartedRef.current = false;
    
    // Set didMount to true after first render
    didMountRef.current = true;
    
    // Only create a new editor if one doesn't exist and we have a container
    if (editorContainerRef.current && !editorViewRef.current) {
      console.log('Creating new editor view');
      
      const extensions = getEditorExtensions({
        language,
        readOnly,
        onChange: (content) => {
          console.log('Editor content changed via CodeMirror', {
            contentLength: content.length,
            contentPreview: content.substring(0, 20) + '...',
          });
          onChangeRef.current?.(content);
        },
        onSave: () => {
          console.log('Editor save triggered via CodeMirror');
          onSaveRef.current?.();
        },
      });

      const startState = EditorState.create({
        doc: initialValue,
        extensions,
      });

      const view = new EditorView({
        state: startState,
        parent: editorContainerRef.current,
      });

      editorViewRef.current = view;
      
      console.log('Editor view created', {
        docLength: view.state.doc.length,
        docPreview: view.state.doc.toString().substring(0, 20) + '...',
      });
    }
    
    // Cleanup function to destroy the editor view only when component actually unmounts
    return () => {
      // Ustaw flagę czyszczenia komponentu, aby zapobiec wywołaniom API na niszczonym widoku
      cleanupStartedRef.current = true;
      
      console.log('Setup effect cleanup (component unmounting)', {
        hasEditorView: Boolean(editorViewRef.current),
        renderCount: renderCount.current,
        cleanupStarted: cleanupStartedRef.current
      });
      
      if (editorViewRef.current) {
        console.log('Destroying editor view');
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, []); // Empty dependency array - run only on mount and unmount
  
  // Separate effect for handling language and readOnly changes
  useEffect(() => {
    // Nie wykonuj operacji w trakcie czyszczenia komponentu
    if (cleanupStartedRef.current) return;
    
    // Only run after initial mount and if editor exists
    if (!didMountRef.current || !editorViewRef.current) return;
    
    const view = editorViewRef.current;
    
    // Check if we need to reconfigure for language or readOnly changes
    console.log('Checking if editor needs reconfiguration', {
      languageChanged: prevPropsRef.current.language !== language,
      readOnlyChanged: prevPropsRef.current.readOnly !== readOnly,
      cleanupStarted: cleanupStartedRef.current
    });
    
    if (prevPropsRef.current.language !== language || 
        prevPropsRef.current.readOnly !== readOnly) {
      
      console.log('Reconfiguring editor with new extensions', {
        language,
        readOnly,
        prevLanguage: prevPropsRef.current.language,
        prevReadOnly: prevPropsRef.current.readOnly,
      });
      
      const newExtensions = getEditorExtensions({
        language,
        readOnly,
        onChange: (content) => {
          console.log('Editor content changed via CodeMirror (after reconfig)', {
            contentLength: content.length,
            contentPreview: content.substring(0, 20) + '...',
          });
          onChangeRef.current?.(content);
        },
        onSave: () => {
          console.log('Editor save triggered via CodeMirror (after reconfig)');
          onSaveRef.current?.();
        },
      });

      view.dispatch({
        effects: StateEffect.reconfigure.of(newExtensions),
      });
    }
  }, [language, readOnly]);

  const getLanguageLabel = (lang: string): string => {
    switch (lang) {
      case "html": return "HTML";
      case "css": return "CSS";
      case "javascript": return "JavaScript";
      case "typescript": return "TypeScript";
      case "jsx": return "JSX";
      case "tsx": return "TypeScript JSX";
      case "mjs": return "JavaScript Module";
      case "python": return "Python";
      case "ruby": return "Ruby";
      case "php": return "PHP";
      case "java": return "Java";
      case "go": return "Go";
      case "rust": return "Rust";
      case "c": return "C";
      case "cpp": return "C++";
      case "csharp": return "C#";
      case "json": return "JSON";
      case "yaml": return "YAML";
      case "markdown": return "Markdown";
      case "sql": return "SQL";
      case "shell": return "Shell";
      case "xml": return "XML";
      case "sass": return "Sass";
      case "less": return "Less";
      default: return lang.charAt(0).toUpperCase() + lang.slice(1);
    }
  };

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div className="absolute inset-0">
        <ScrollArea className="absolute inset-0 w-full h-full" type="always">
          <div 
            ref={editorContainerRef}
            className="absolute inset-0"
            data-editor-container
            style={{ overscrollBehavior: "none" }}
          />
          <div className="absolute bottom-2 right-2 px-2.5 py-1 text-xs font-medium bg-primary/5 text-primary/70 rounded-md border border-primary/10 select-none opacity-80 hover:opacity-100 transition-opacity">
            {getLanguageLabel(language)}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
} 
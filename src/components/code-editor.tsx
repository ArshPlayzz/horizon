"use client"

import { useEffect, useRef } from "react"
import { basicSetup } from "codemirror"
import { EditorState } from "@codemirror/state"
import { javascript } from "@codemirror/lang-javascript"
import { cn } from "@/lib/utils"
import { autocompletion, completionKeymap } from "@codemirror/autocomplete"
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css"
import { indentWithTab } from "@codemirror/commands"
import { lintKeymap } from "@codemirror/lint"
import { EditorView, keymap } from "@codemirror/view"
import { searchKeymap } from "@codemirror/search"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

// Motyw CodeMirror zgodny z motywem shadcn
const shadcnTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "var(--background)",
    color: "var(--foreground)"
  },
  ".cm-scroller": {
    overflow: "auto"
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
    fontFamily: "'Geist Mono', monospace"
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
    minWidth: "3em"
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

// Definicja podświetlania składni
const shadcnHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--primary)" },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: t.string, color: "var(--chart-4)" },
  { tag: t.number, color: "var(--chart-3)" },
  { tag: t.operator, color: "var(--foreground)" },
  { tag: t.tagName, color: "var(--chart-1)" },
  { tag: t.attributeName, color: "var(--chart-2)" },
  { tag: t.className, color: "var(--chart-5)" },
  { tag: t.propertyName, color: "var(--chart-2)" },
  { tag: t.variableName, color: "var(--foreground)" },
  { tag: t.function(t.variableName), color: "var(--chart-1)" },
  { tag: t.typeName, color: "var(--chart-5)" },
  { tag: t.bool, color: "var(--chart-3)" },
  { tag: t.definition(t.variableName), color: "var(--chart-5)" },
]);

export interface CodeEditorProps {
  initialValue?: string
  onChange?: (value: string) => void
  language?: "javascript" | "typescript" | "jsx" | "tsx" | "html" | "css"
  className?: string
  readOnly?: boolean
}

export function CodeEditor({
  initialValue = "",
  onChange,
  language = "typescript",
  className,
  readOnly = false,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  // Funkcja do pobierania pełnej nazwy języka
  const getLanguageLabel = (lang: string): string => {
    switch (lang) {
      case "html": return "HTML";
      case "css": return "CSS";
      case "javascript": return "JavaScript";
      case "typescript": return "TypeScript";
      case "jsx": return "JSX";
      case "tsx": return "TypeScript JSX";
      default: return "TypeScript";
    }
  };

  useEffect(() => {
    if (!editorRef.current) return

    if (editorViewRef.current) {
      editorViewRef.current.destroy()
    }

    let langExtension
    switch (language) {
      case "html":
        langExtension = html()
        break
      case "css":
        langExtension = css()
        break
      case "javascript":
        langExtension = javascript()
        break
      case "typescript":
        langExtension = javascript({ typescript: true })
        break
      case "jsx":
        langExtension = javascript({ jsx: true })
        break
      case "tsx":
        langExtension = javascript({ jsx: true, typescript: true })
        break
      default:
        langExtension = javascript({ typescript: true })
    }

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        langExtension,
        shadcnTheme,
        syntaxHighlighting(shadcnHighlightStyle),
        autocompletion(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString())
          }
        }),
        EditorView.editable.of(!readOnly),
        keymap.of([
          ...completionKeymap,
          ...searchKeymap,
          ...lintKeymap,
          indentWithTab
        ])
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    editorViewRef.current = view

    return () => {
      view.destroy()
    }
  }, [initialValue, onChange, language, readOnly])

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div 
        ref={editorRef}
        className="w-full h-full overflow-hidden rounded-md border border-muted"
        data-editor-container
      />
      <div className="absolute bottom-2 right-2 px-2 py-1 text-[10px] font-mono bg-muted text-muted-foreground rounded">
        {getLanguageLabel(language)}
      </div>
    </div>
  )
} 
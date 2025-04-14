import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cn } from "@/lib/utils";
import { X, Plus, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileContext } from "@/lib/file-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { open } from '@tauri-apps/plugin-shell';

interface TerminalProps {
  workingDirectory?: string;
  onClose: () => void;
  className?: string;
  isTerminalVisible: boolean;
  instances: TerminalInstance[];
  setInstances: React.Dispatch<React.SetStateAction<TerminalInstance[]>>;
  activeInstanceId: string | null;
  setActiveInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface TerminalState {
  output: string[];
  currentInput: string;
  sessionId: string | null;
  commandHistory: string[];
  historyIndex: number;
  isLocked: boolean;
}

interface TerminalInstance {
  id: string;
  name: string;
  state: TerminalState;
  workingDirectory: string;
  processName: string;
}

// Funkcja pomocnicza do wykrywania URL-i
const detectUrls = (text: string): { text: string; isUrl: boolean; url: string }[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts: { text: string; isUrl: boolean; url: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Dodaj tekst przed URL-em
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        isUrl: false,
        url: ''
      });
    }
    // Dodaj URL
    parts.push({
      text: match[0],
      isUrl: true,
      url: match[0]
    });
    lastIndex = match.index + match[0].length;
  }

  // Dodaj pozostały tekst
  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isUrl: false,
      url: ''
    });
  }

  return parts;
};

// Funkcja do sanitizacji wyjścia terminala
const sanitizeTerminalOutput = (text: string): string => {
  // Remove ANSI escape sequences
  return text
    // Basic ANSI sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Hyperlinks
    .replace(/\x1b\]8;;.*?\x1b\\/g, '')
    .replace(/\x1b\]8;;.*?\x07/g, '')
    // Other ANSI sequences
    .replace(/\x1b\]1337;.*?\x1b\\/g, '')
    .replace(/\x1b\]1337;.*?\x07/g, '')
    // Cursor control sequences
    .replace(/\x1b\[\?25[hl]/g, '')
    .replace(/\x1b\[[0-9]*[ABCDEFGHJKST]/g, '')
    // Clear screen sequences
    .replace(/\x1b\[[0-9]*[JK]/g, '')
    // Color sequences
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Device control sequences
    .replace(/\x1b\[[0-9;]*[cnsu]/g, '')
    // Terminal mode sequences
    .replace(/\x1b\[[0-9;]*[hl]/g, '')
    // Remove any remaining escape sequences
    .replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^a-zA-Z]*[a-zA-Z]/g, '')
    .replace(/\x1b[^a-zA-Z]/g, '');
};

const Terminal: React.FC<TerminalProps> = ({ 
  workingDirectory, 
  onClose, 
  className, 
  instances,
  setInstances,
  activeInstanceId,
  setActiveInstanceId
}) => {
  const { currentDirectory } = useFileContext();
  const terminalRef = useRef<HTMLDivElement>(null);

  // Load command history when component mounts
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('load_command_history');
        if (history && history.length > 0) {
          setInstances(prev => prev.map(instance => ({
            ...instance,
            state: {
              ...instance.state,
              commandHistory: history
            }
          })));
        }
      } catch (error) {
        console.error('Failed to load command history:', error);
      }
    };

    loadHistory();
  }, []);

  // Save command history when it changes
  useEffect(() => {
    const saveHistory = async () => {
      const activeInstance = instances.find(i => i.id === activeInstanceId);
      if (activeInstance && activeInstance.state.commandHistory.length > 0) {
        try {
          await invoke('save_command_history', { 
            history: activeInstance.state.commandHistory 
          });
        } catch (error) {
          console.error('Failed to save command history:', error);
        }
      }
    };

    saveHistory();
  }, [instances, activeInstanceId]);

  const createNewInstance = async () => {
    try {
      const id = await invoke<string>('create_terminal_session', {
        workingDir: currentDirectory || workingDirectory || '.'
      });

      // Get the process name
      const processName = await invoke<string>('get_terminal_process_name', { id });

      const newInstance: TerminalInstance = {
        id,
        name: processName || `Terminal ${instances.length + 1}`,
        state: {
          output: [],
          currentInput: '',
          sessionId: id,
          commandHistory: [],
          historyIndex: 0,
          isLocked: false
        },
        workingDirectory: currentDirectory || workingDirectory || '.',
        processName: processName || 'bash'
      };

      setInstances(prev => [...prev, newInstance]);
      setActiveInstanceId(id);

      // Listen for terminal output
      const stdoutUnlisten = await listen<string>(`terminal_output_${id}`, (event) => {
        let output = '';
        if (typeof event.payload === 'string') {
          output = event.payload;
        } else if (Array.isArray(event.payload)) {
          output = String.fromCharCode(...(event.payload as number[]));
        } else {
          output = String(event.payload);
        }
        // Sanitize output before adding to state
        output = sanitizeTerminalOutput(output);
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, output] } }
            : instance
        ));
      });

      // Listen for terminal errors
      const stderrUnlisten = await listen<string>(`terminal_error_${id}`, (event) => {
        let error = '';
        if (typeof event.payload === 'string') {
          error = event.payload;
        } else if (Array.isArray(event.payload)) {
          error = String.fromCharCode(...(event.payload as number[]));
        } else {
          error = String(event.payload);
        }
        // Sanitize error before adding to state
        error = sanitizeTerminalOutput(error);
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, `Error: ${error}`] } }
            : instance
        ));
      });

      // Listen for process exit
      const exitUnlisten = await listen(`terminal_exit_${id}`, () => {
        setInstances(prev => prev.map(instance => 
          instance.id === id 
            ? { ...instance, state: { ...instance.state, output: [...instance.state.output, 'Process terminated.'] } }
            : instance
        ));
      });

      return () => {
        stdoutUnlisten();
        stderrUnlisten();
        exitUnlisten();
      };
    } catch (error) {
      console.error('Failed to create terminal session:', error);
    }
  };

  const handleInput = async (input: string, instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    // Jeśli to Ctrl+C, zawsze pozwalamy na jego obsługę, nawet gdy terminal jest zablokowany
    if (input === '\x03') {
      console.log('Sending SIGINT signal');
      try {
        // Wysyłamy tylko sygnał SIGINT
        await invoke('send_terminal_signal', { 
          id: instanceId,
          signal: 'SIGINT'
        });

        // Odblokowujemy terminal
        setInstances(prev => prev.map(i => 
          i.id === instanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  isLocked: false,
                  output: [...i.state.output, 'Process terminated.']
                } 
              }
            : i
        ));
      } catch (error) {
        console.error('Failed to handle Ctrl+C:', error);
        // W przypadku błędu, przynajmniej odblokuj terminal
        setInstances(prev => prev.map(i => 
          i.id === instanceId 
            ? { ...i, state: { ...i.state, isLocked: false } }
            : i
        ));
      }
      return;
    }

    // Jeśli terminal jest zablokowany, ignoruj pozostałe inputy
    if (instance.state.isLocked) {
      return;
    }

    // Obsługa komendy clear
    if (input.trim().toLowerCase() === 'clear') {
      // Najpierw wyczyść ekran
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { ...i, state: { ...i.state, output: [] } }
          : i
      ));
      // Następnie dodaj komendę do historii
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { 
              ...i, 
              state: { 
                ...i.state, 
                currentInput: '', 
                commandHistory: [...i.state.commandHistory, input],
                historyIndex: i.state.commandHistory.length + 1
              } 
            }
          : i
      ));
      return;
    }

    // Sprawdź czy to komenda npm run dev
    if (input.trim() === 'npm run dev') {
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { 
              ...i, 
              state: { 
                ...i.state, 
                isLocked: true,
                currentInput: '', 
                output: [...i.state.output, `$ ${input}`],
                commandHistory: [...i.state.commandHistory, input],
                historyIndex: i.state.commandHistory.length + 1
              } 
            }
          : i
      ));
    }

    setInstances(prev => prev.map(i => 
      i.id === instanceId 
        ? { 
            ...i, 
            state: { 
              ...i.state, 
              currentInput: '', 
              output: [...i.state.output, `$ ${input}`],
              commandHistory: [...i.state.commandHistory, input],
              historyIndex: i.state.commandHistory.length + 1
            } 
          }
        : i
    ));

    try {
      await invoke('send_terminal_command', {
        id: instanceId,
        command: input + '\n'
      });
    } catch (error) {
      console.error('Failed to send command:', error);
      setInstances(prev => prev.map(i => 
        i.id === instanceId 
          ? { ...i, state: { ...i.state, output: [...i.state.output, `Error sending command: ${error}`] } }
          : i
      ));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!activeInstanceId) return;
    
    const activeInstance = instances.find(i => i.id === activeInstanceId);
    if (!activeInstance) return;

    // Jeśli terminal jest zablokowany, pozwól tylko na Ctrl+C
    if (activeInstance.state.isLocked) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        console.log('Ctrl+C pressed on locked terminal');
        handleInput('\x03', activeInstanceId);
      }
      return;
    }

    // Obsługa skrótów klawiszowych
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          // Ctrl+D / Cmd+D - wysyłamy EOF
          e.preventDefault();
          handleInput('\x04', activeInstanceId);
          return;
        case 'l':
          // Ctrl+L / Cmd+L - czyścimy ekran
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, output: [] } }
              : i
          ));
          return;
        case 'u':
          // Ctrl+U / Cmd+U - czyścimy linię
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: '' } }
              : i
          ));
          return;
        case 'k':
          // Ctrl+K / Cmd+K - czyścimy ekran i historię
          e.preventDefault();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, output: [], commandHistory: [] } }
              : i
          ));
          return;
        case 'a':
          // Ctrl+A / Cmd+A - przejście na początek linii
          e.preventDefault();
          const input = activeInstance.state.currentInput;
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: input } }
              : i
          ));
          return;
        case 'e':
          // Ctrl+E / Cmd+E - przejście na koniec linii
          e.preventDefault();
          return;
        case 'w':
          // Ctrl+W / Cmd+W - usunięcie ostatniego słowa
          e.preventDefault();
          const words = activeInstance.state.currentInput.split(' ');
          words.pop();
          setInstances(prev => prev.map(i => 
            i.id === activeInstanceId 
              ? { ...i, state: { ...i.state, currentInput: words.join(' ') } }
              : i
          ));
          return;
        case 'r':
          // Ctrl+R / Cmd+R - wyszukiwanie w historii komend
          e.preventDefault();
          return;
        case 't':
          // Ctrl+T / Cmd+T - otwarcie nowej karty terminala
          e.preventDefault();
          createNewInstance();
          return;
        case 'n':
          // Ctrl+N / Cmd+N - otwarcie nowego okna terminala
          e.preventDefault();
          createNewInstance();
          return;
      }
    }

    // Obsługa przełączania między kartami
    if ((e.ctrlKey || e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      const currentIndex = instances.findIndex(i => i.id === activeInstanceId);
      if (e.key === 'PageUp' && currentIndex > 0) {
        setActiveInstanceId(instances[currentIndex - 1].id);
      } else if (e.key === 'PageDown' && currentIndex < instances.length - 1) {
        setActiveInstanceId(instances[currentIndex + 1].id);
      }
      return;
    }

    // Obsługa klawiszy strzałek
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const history = activeInstance.state.commandHistory;
      const currentIndex = activeInstance.state.historyIndex;
      
      if (e.key === 'ArrowUp' && currentIndex > 0) {
        // Przejdź do poprzedniej komendy
        setInstances(prev => prev.map(i => 
          i.id === activeInstanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  currentInput: history[currentIndex - 1],
                  historyIndex: currentIndex - 1
                } 
              }
            : i
        ));
      } else if (e.key === 'ArrowDown' && currentIndex < history.length) {
        // Przejdź do następnej komendy lub wyczyść jeśli jesteśmy na końcu
        setInstances(prev => prev.map(i => 
          i.id === activeInstanceId 
            ? { 
                ...i, 
                state: { 
                  ...i.state, 
                  currentInput: currentIndex === history.length - 1 ? '' : history[currentIndex + 1],
                  historyIndex: currentIndex + 1
                } 
              }
            : i
        ));
      }
      return;
    }

    // Obsługa klawisza Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      // TODO: Implementacja autouzupełniania
      return;
    }

    // Standardowa obsługa klawiszy
    if (e.key === 'Enter' && activeInstance.state.currentInput.trim()) {
      handleInput(activeInstance.state.currentInput.trim(), activeInstanceId);
    } else if (e.key === 'Backspace') {
      setInstances(prev => prev.map(i => 
        i.id === activeInstanceId 
          ? { ...i, state: { ...i.state, currentInput: i.state.currentInput.slice(0, -1) } }
          : i
      ));
    } else if (e.key.length === 1) {
      setInstances(prev => prev.map(i => 
        i.id === activeInstanceId 
          ? { ...i, state: { ...i.state, currentInput: i.state.currentInput + e.key } }
          : i
      ));
    }
  };

  const closeInstance = async (instanceId: string) => {
    try {
      await invoke('terminate_terminal_session', { id: instanceId });
      if (instanceId === activeInstanceId) {
        const remainingInstances = instances.filter(i => i.id !== instanceId);
        const lastInstance = remainingInstances[remainingInstances.length - 1];
        setActiveInstanceId(lastInstance?.id || null);
      }
      setInstances(prev => prev.filter(i => i.id !== instanceId));
    } catch (error) {
      console.error('Failed to terminate terminal session:', error);
    }
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [instances]);

  const activeInstance = instances.find(i => i.id === activeInstanceId);

  return (
    <div 
      className={cn(
        "flex flex-col h-full text-sidebar-foreground",
        className
      )}
      onKeyDown={handleKeyPress}
      tabIndex={0}
    >
      <div className="flex items-center justify-between py-2 px-4 border-b border-sidebar-border bg-sidebar/50">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-sidebar-foreground">
            {activeInstance?.name || 'Terminal'}
          </div>
          <div className="text-xs text-sidebar-foreground/70">
            {activeInstance?.workingDirectory || currentDirectory || workingDirectory || 'Default'}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose} 
          title="Close Terminal"
          className="h-6 w-6 hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col">
          <ScrollArea className="h-full cursor-text">
            <div 
              ref={terminalRef}
              className="p-4 font-mono text-sm text-sidebar-foreground/90"
            >
              {activeInstance?.state.output.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {detectUrls(sanitizeTerminalOutput(line)).map((part, j) => 
                    part.isUrl ? (
                      <span
                        key={j}
                        className="text-blue-500 hover:text-blue-400 cursor-pointer underline"
                        onClick={async () => {
                          try {
                            await open(part.url);
                          } catch (error) {
                            console.error('Failed to open URL:', error);
                          }
                        }}
                      >
                        {part.text}
                      </span>
                    ) : (
                      <span key={j}>{part.text}</span>
                    )
                  )}
                </div>
              ))}
              <div className="flex items-center">
                <span className="text-green-500">$</span>
                <span className="ml-2 font-mono whitespace-pre">
                  {activeInstance?.state.currentInput}
                  {activeInstance?.state.isLocked && (
                    <span className="text-sidebar-foreground/50 ml-2">
                      (Terminal locked - press Ctrl+C to unlock)
                    </span>
                  )}
                </span>
                {activeInstance?.id === activeInstanceId && !activeInstance?.state.isLocked && (
                  <span className="bg-sidebar-foreground w-1 h-4 ml-0 [animation:blink_1s_steps(1)_infinite] [@keyframes_blink{0%,100%{opacity:1}50%{opacity:0}}]"></span>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
        <Separator orientation="vertical" />
        <div className="w-48 flex flex-col bg-sidebar/50">
          <ScrollArea className="flex-1 h-full">
            <div className="p-2 space-y-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start hover:bg-accent hover:text-accent-foreground"
                title="Create New Terminal"
                onClick={createNewInstance}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Terminal
              </Button>
              {instances.map((instance) => (
                <div
                  key={instance.id}
                  className={cn(
                    "flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-all duration-300",
                    instance.id === activeInstanceId 
                      ? "bg-accent text-accent-foreground" 
                      : "hover:bg-accent/50 text-sidebar-foreground/70"
                  )}
                  title={`Open Terminal: ${instance.name}`}
                  onClick={() => setActiveInstanceId(instance.id)}
                >
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4" />
                    <span className="truncate text-sm font-medium">{instance.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-accent/80"
                    title="Close Terminal"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeInstance(instance.id);
                    }}
                  >
                    <X className="h-4 w-4 text-sidebar-foreground/70" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default Terminal; 
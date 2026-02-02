import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { socketService } from '../../services/socket'
import { Plus, X, Terminal as TerminalIcon, Send, ChevronUp, ChevronDown } from 'lucide-react'
import { Keyboard } from '@capacitor/keyboard'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import 'xterm/css/xterm.css'

interface ConsoleTab {
  id: string
  terminal: XTerminal
  fitAddon: FitAddon
  commandHistory: string[]
  historyIndex: number
}

interface MobileTerminalProps {
  visible?: boolean
}

export default function MobileTerminal({ visible = true }: MobileTerminalProps) {
  const [tabs, setTabs] = useState<ConsoleTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const PROMPT = '\x1b[1;31mmsf6\x1b[0m > '

  // Listen for keyboard events
  useEffect(() => {
    const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
      setKeyboardVisible(true)
      setKeyboardHeight(info.keyboardHeight)
    })

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardVisible(false)
      setKeyboardHeight(0)
    })

    return () => {
      showListener.then(l => l.remove())
      hideListener.then(l => l.remove())
    }
  }, [])

  const createNewConsole = async () => {
    await Haptics.impact({ style: ImpactStyle.Light })
    const consoleId = await socketService.createConsole()

    const terminal = new XTerminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#f85149',
        green: '#238636',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#a371f7',
        cyan: '#56d4dd',
        white: '#e6edf3',
        brightBlack: '#484f58',
        brightRed: '#f85149',
        brightGreen: '#2ea043',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#76e3ea',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: true,
      disableStdin: true, // We use external input on mobile
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.writeln('\x1b[36m╔══════════════════════════════════════════╗')
    terminal.writeln('║  \x1b[1;37mMetasploit Framework Console\x1b[0m\x1b[36m            ║')
    terminal.writeln('║  \x1b[33mMobile Terminal\x1b[0m\x1b[36m                         ║')
    terminal.writeln('╚══════════════════════════════════════════╝\x1b[0m')
    terminal.writeln('')
    terminal.write(PROMPT)

    let promptTimer: ReturnType<typeof setTimeout> | null = null

    const unsubscribe = socketService.onConsoleOutput(consoleId, (output) => {
      if (output.data) {
        const normalizedData = output.data.replace(/\r?\n/g, '\r\n')
        terminal.write(normalizedData)

        if (promptTimer) clearTimeout(promptTimer)
        promptTimer = setTimeout(() => {
          terminal.write('\r\n')
          terminal.write(PROMPT)
          // Auto-scroll to bottom
          terminal.scrollToBottom()
        }, 150)
      }
    })

    const newTab: ConsoleTab = {
      id: consoleId,
      terminal,
      fitAddon,
      commandHistory: [],
      historyIndex: -1,
    }
    ;(newTab as any).unsubscribe = unsubscribe
    ;(newTab as any).promptTimer = promptTimer

    setTabs((prev) => [...prev, newTab])
    setActiveTab(consoleId)
  }

  const closeConsole = async (consoleId: string) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    const tab = tabs.find((t) => t.id === consoleId)
    if (tab) {
      if ((tab as any).promptTimer) clearTimeout((tab as any).promptTimer)
      ;(tab as any).unsubscribe?.()
      tab.terminal.dispose()
      socketService.destroyConsole(consoleId)
    }

    const newTabs = tabs.filter((t) => t.id !== consoleId)
    setTabs(newTabs)

    if (activeTab === consoleId) {
      setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
    }
  }

  const sendCommand = async () => {
    const activeTerminalTab = tabs.find((t) => t.id === activeTab)
    if (!activeTerminalTab || !inputValue.trim()) return

    await Haptics.impact({ style: ImpactStyle.Light })

    // Add to history
    if (inputValue.trim()) {
      activeTerminalTab.commandHistory.push(inputValue)
      activeTerminalTab.historyIndex = -1
    }

    // Echo command to terminal
    activeTerminalTab.terminal.writeln(inputValue)

    // Send to server
    socketService.sendConsoleInput(activeTerminalTab.id, inputValue)

    // Clear input
    setInputValue('')
  }

  const navigateHistory = (direction: 'up' | 'down') => {
    const activeTerminalTab = tabs.find((t) => t.id === activeTab)
    if (!activeTerminalTab || activeTerminalTab.commandHistory.length === 0) return

    Haptics.impact({ style: ImpactStyle.Light })

    if (direction === 'up') {
      if (activeTerminalTab.historyIndex === -1) {
        activeTerminalTab.historyIndex = activeTerminalTab.commandHistory.length - 1
      } else if (activeTerminalTab.historyIndex > 0) {
        activeTerminalTab.historyIndex--
      }
      setInputValue(activeTerminalTab.commandHistory[activeTerminalTab.historyIndex] || '')
    } else {
      if (activeTerminalTab.historyIndex !== -1) {
        if (activeTerminalTab.historyIndex < activeTerminalTab.commandHistory.length - 1) {
          activeTerminalTab.historyIndex++
          setInputValue(activeTerminalTab.commandHistory[activeTerminalTab.historyIndex] || '')
        } else {
          activeTerminalTab.historyIndex = -1
          setInputValue('')
        }
      }
    }
  }

  // Quick commands for common operations
  const quickCommands = [
    { label: 'help', command: 'help' },
    { label: 'sessions', command: 'sessions -l' },
    { label: 'jobs', command: 'jobs -l' },
    { label: 'back', command: 'back' },
    { label: 'exit', command: 'exit' },
  ]

  const executeQuickCommand = async (command: string) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setInputValue(command)
    setTimeout(() => {
      sendCommand()
    }, 50)
  }

  // Mount active terminal
  useEffect(() => {
    const activeTerminalTab = tabs.find((t) => t.id === activeTab)
    if (activeTerminalTab && terminalContainerRef.current) {
      terminalContainerRef.current.innerHTML = ''
      activeTerminalTab.terminal.open(terminalContainerRef.current)
      setTimeout(() => {
        activeTerminalTab.fitAddon.fit()
      }, 50)
    }
  }, [activeTab, tabs])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const activeTerminalTab = tabs.find((t) => t.id === activeTab)
      if (activeTerminalTab) {
        activeTerminalTab.fitAddon.fit()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeTab, tabs])

  // Re-fit terminal when becoming visible or keyboard changes
  useEffect(() => {
    if (visible) {
      const activeTerminalTab = tabs.find((t) => t.id === activeTab)
      if (activeTerminalTab && terminalContainerRef.current) {
        setTimeout(() => {
          activeTerminalTab.fitAddon.fit()
        }, 100)
      }
    }
  }, [visible, activeTab, tabs, keyboardVisible])

  if (!visible) return null

  return (
    <div
      className="flex flex-col h-full"
      style={{
        paddingBottom: keyboardVisible ? `${keyboardHeight}px` : '0px',
        transition: 'padding-bottom 0.25s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-msf-darker border-b border-msf-border">
        <h1 className="text-lg font-bold text-white">Terminal</h1>
        <button
          onClick={createNewConsole}
          className="flex items-center gap-2 px-3 py-2 bg-msf-accent text-white rounded-lg touch-btn"
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm">New</span>
        </button>
      </div>

      {tabs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <TerminalIcon className="w-16 h-16 mx-auto mb-4 text-gray-500" />
            <h2 className="text-xl font-semibold text-white mb-2">No Active Consoles</h2>
            <p className="text-gray-400 mb-6">
              Create a console to start using msfconsole.
            </p>
            <button
              onClick={createNewConsole}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Console
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center bg-msf-darker border-b border-msf-border overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-2 px-4 py-3 border-r border-msf-border flex-shrink-0 ${
                  activeTab === tab.id ? 'bg-msf-card' : 'active:bg-msf-card/50'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <TerminalIcon className="w-4 h-4 text-msf-accent" />
                <span className="text-sm text-white whitespace-nowrap">
                  {tab.id.slice(0, 6)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeConsole(tab.id)
                  }}
                  className="ml-1 p-1 text-gray-400 active:text-msf-red"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Terminal Output */}
          <div
            ref={terminalContainerRef}
            className="flex-1 min-h-0"
            style={{
              padding: '8px',
              backgroundColor: '#0d1117',
              overflow: 'hidden',
            }}
          />

          {/* Quick Commands */}
          <div className="flex gap-2 px-3 py-2 bg-msf-darker border-t border-msf-border overflow-x-auto">
            {quickCommands.map((qc) => (
              <button
                key={qc.command}
                onClick={() => executeQuickCommand(qc.command)}
                className="px-3 py-1.5 bg-msf-card text-gray-300 text-sm rounded-md border border-msf-border active:bg-msf-border whitespace-nowrap"
              >
                {qc.label}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="flex items-center gap-2 px-3 py-3 bg-msf-darker border-t border-msf-border safe-area-bottom">
            <button
              onClick={() => navigateHistory('up')}
              className="p-2 text-gray-400 active:text-white touch-btn"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigateHistory('down')}
              className="p-2 text-gray-400 active:text-white touch-btn"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendCommand()
                }
              }}
              placeholder="Enter command..."
              className="flex-1 px-4 py-3 bg-msf-card border border-msf-border rounded-lg text-white placeholder-gray-500 text-base"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              onClick={sendCommand}
              disabled={!inputValue.trim()}
              className={`p-3 rounded-lg touch-btn ${
                inputValue.trim()
                  ? 'bg-msf-accent text-white active:bg-msf-accent-hover'
                  : 'bg-msf-card text-gray-500'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { socketService } from '../../services/socket'
import { Plus, X, Terminal as TerminalIcon, Maximize2, Minimize2 } from 'lucide-react'
import 'xterm/css/xterm.css'

interface ConsoleTab {
  id: string
  terminal: XTerminal
  fitAddon: FitAddon
}

interface TerminalProps {
  visible?: boolean
}

export default function Terminal({ visible = true }: TerminalProps) {
  const [tabs, setTabs] = useState<ConsoleTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const terminalContainerRef = useRef<HTMLDivElement>(null)

  const createNewConsole = async () => {
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
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: true,  // Convert LF to CRLF for proper line handling
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    // Handle user input
    let inputBuffer = ''
    terminal.onData((data) => {
      if (data === '\r') {
        // Enter pressed
        socketService.sendConsoleInput(consoleId, inputBuffer)
        inputBuffer = ''
        terminal.write('\r\n')
      } else if (data === '\x7f') {
        // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (data === '\x03') {
        // Ctrl+C
        socketService.sendConsoleInput(consoleId, '\x03')
        inputBuffer = ''
      } else {
        inputBuffer += data
        terminal.write(data)
      }
    })

    // Handle output from console
    const unsubscribe = socketService.onConsoleOutput(consoleId, (output) => {
      if (output.data) {
        // Normalize line endings: replace standalone \n with \r\n
        // but avoid replacing \r\n that already exists
        const normalizedData = output.data.replace(/\r?\n/g, '\r\n')
        terminal.write(normalizedData)
      }
    })

    const newTab: ConsoleTab = { id: consoleId, terminal, fitAddon }
    setTabs((prev) => [...prev, newTab])
    setActiveTab(consoleId)

    // Store unsubscribe function for cleanup
    ;(newTab as any).unsubscribe = unsubscribe
  }

  const closeConsole = (consoleId: string) => {
    const tab = tabs.find((t) => t.id === consoleId)
    if (tab) {
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

  // Mount active terminal
  useEffect(() => {
    const activeTerminalTab = tabs.find((t) => t.id === activeTab)
    if (activeTerminalTab && terminalContainerRef.current) {
      terminalContainerRef.current.innerHTML = ''
      activeTerminalTab.terminal.open(terminalContainerRef.current)
      activeTerminalTab.fitAddon.fit()
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

  // Re-fit terminal when becoming visible
  useEffect(() => {
    if (visible) {
      const activeTerminalTab = tabs.find((t) => t.id === activeTab)
      if (activeTerminalTab && terminalContainerRef.current) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          activeTerminalTab.fitAddon.fit()
        }, 50)
      }
    }
  }, [visible, activeTab, tabs])

  return (
    <div
      className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-msf-dark p-4' : ''}`}
      style={{ display: visible ? 'block' : 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Terminal</h1>
          <p className="text-gray-400 mt-1">Interactive msfconsole</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn btn-secondary flex items-center gap-2"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button onClick={createNewConsole} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Console
          </button>
        </div>
      </div>

      {/* Terminal Area */}
      <div
        className={`bg-msf-card border border-msf-border rounded-lg overflow-hidden ${
          isFullscreen ? 'flex-1 flex flex-col' : ''
        }`}
      >
        {tabs.length === 0 ? (
          <div className="p-12 text-center">
            <TerminalIcon className="w-16 h-16 mx-auto mb-4 text-gray-500" />
            <h2 className="text-xl font-semibold text-white mb-2">No Active Consoles</h2>
            <p className="text-gray-400 max-w-md mx-auto mb-6">
              Create a new console to start using msfconsole directly from your browser.
            </p>
            <button onClick={createNewConsole} className="btn btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create Console
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center border-b border-msf-border bg-msf-darker">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-4 py-2 border-r border-msf-border cursor-pointer ${
                    activeTab === tab.id ? 'bg-msf-card' : 'hover:bg-msf-card/50'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <TerminalIcon className="w-4 h-4 text-msf-accent" />
                  <span className="text-sm text-white">Console {tab.id.slice(0, 8)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeConsole(tab.id)
                    }}
                    className="ml-2 p-0.5 text-gray-400 hover:text-msf-red"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={createNewConsole}
                className="p-2 text-gray-400 hover:text-white"
                title="New Console"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Terminal Container */}
            <div
              ref={terminalContainerRef}
              className={`${isFullscreen ? 'flex-1' : 'h-[500px]'}`}
              style={{ padding: '8px' }}
            />
          </>
        )}
      </div>

      {/* Help */}
      {tabs.length > 0 && (
        <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
          <p className="text-sm text-gray-400">
            <strong className="text-white">Tips:</strong> Use standard msfconsole commands. Type{' '}
            <code className="bg-msf-card px-1 rounded">help</code> to see available commands.
            Press <code className="bg-msf-card px-1 rounded">Ctrl+C</code> to cancel current
            operation.
          </p>
        </div>
      )}
    </div>
  )
}

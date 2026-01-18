import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { socketService } from '../../services/socket'
import { Session } from '../../types'
import { X, Maximize2, Minimize2, Monitor, Server, Globe } from 'lucide-react'
import 'xterm/css/xterm.css'

interface SessionTerminalProps {
  session: Session
  onClose: () => void
}

export default function SessionTerminal({ session, onClose }: SessionTerminalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputBufferRef = useRef('')
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const sessionType = session.type === 'meterpreter' ? 'meterpreter' : 'shell'

  const getSessionIcon = () => {
    if (session.platform?.toLowerCase().includes('windows')) {
      return <Monitor className="w-4 h-4" />
    }
    if (session.platform?.toLowerCase().includes('linux')) {
      return <Server className="w-4 h-4" />
    }
    return <Globe className="w-4 h-4" />
  }

  const handleInput = useCallback((data: string) => {
    const terminal = xtermRef.current
    if (!terminal) return

    if (data === '\r') {
      // Enter pressed - send command
      const command = inputBufferRef.current
      if (command.trim()) {
        setCommandHistory((prev) => [...prev, command])
        setHistoryIndex(-1)
      }
      socketService.sendSessionInput(session.id, command, sessionType)
      inputBufferRef.current = ''
      terminal.write('\r\n')
    } else if (data === '\x7f') {
      // Backspace
      if (inputBufferRef.current.length > 0) {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1)
        terminal.write('\b \b')
      }
    } else if (data === '\x03') {
      // Ctrl+C
      socketService.sendSessionInput(session.id, '\x03', sessionType)
      inputBufferRef.current = ''
    } else if (data === '\x1b[A') {
      // Up arrow - previous command
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        const command = commandHistory[newIndex]
        // Clear current input
        terminal.write('\r\x1b[K')
        terminal.write(sessionType === 'meterpreter' ? 'meterpreter > ' : '$ ')
        terminal.write(command)
        inputBufferRef.current = command
        setHistoryIndex(newIndex)
      }
    } else if (data === '\x1b[B') {
      // Down arrow - next command
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          // Clear to empty
          terminal.write('\r\x1b[K')
          terminal.write(sessionType === 'meterpreter' ? 'meterpreter > ' : '$ ')
          inputBufferRef.current = ''
          setHistoryIndex(-1)
        } else {
          const command = commandHistory[newIndex]
          terminal.write('\r\x1b[K')
          terminal.write(sessionType === 'meterpreter' ? 'meterpreter > ' : '$ ')
          terminal.write(command)
          inputBufferRef.current = command
          setHistoryIndex(newIndex)
        }
      }
    } else if (data.charCodeAt(0) >= 32) {
      // Regular character
      inputBufferRef.current += data
      terminal.write(data)
    }
  }, [session.id, sessionType, commandHistory, historyIndex])

  useEffect(() => {
    if (!terminalRef.current) return

    // Create terminal
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
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // Write welcome message
    terminal.writeln('\x1b[36m╔════════════════════════════════════════════════════════════╗')
    terminal.writeln(`║  Session ${session.id} - ${session.type.toUpperCase()}`)
    terminal.writeln(`║  Host: ${session.session_host || session.tunnel_peer || 'Unknown'}`)
    if (session.username) terminal.writeln(`║  User: ${session.username}`)
    if (session.platform) terminal.writeln(`║  Platform: ${session.platform} ${session.arch || ''}`)
    terminal.writeln('╚════════════════════════════════════════════════════════════╝\x1b[0m')
    terminal.writeln('')

    // Subscribe to session output
    const unsubscribe = socketService.subscribeSessionOutput(
      session.id,
      sessionType,
      (data) => {
        if (data.closed) {
          terminal.writeln('\r\n\x1b[31m[Session closed]\x1b[0m')
        } else if (data.data) {
          // Normalize line endings
          const normalizedData = data.data.replace(/\r?\n/g, '\r\n')
          terminal.write(normalizedData)
        }
      }
    )
    unsubscribeRef.current = unsubscribe

    // Handle input
    terminal.onData(handleInput)

    return () => {
      unsubscribe()
      terminal.dispose()
    }
  }, [session, sessionType, handleInput])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)
    // Also fit when fullscreen changes
    setTimeout(handleResize, 100)

    return () => window.removeEventListener('resize', handleResize)
  }, [isFullscreen])

  const handleClose = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
    }
    socketService.unsubscribeSessionOutput(session.id)
    onClose()
  }

  return (
    <div
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-msf-dark'
          : 'fixed bottom-4 right-4 w-[800px] h-[500px] z-40'
      } flex flex-col rounded-lg border border-msf-border overflow-hidden shadow-2xl`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-msf-darker border-b border-msf-border">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-msf-card rounded">
            {getSessionIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">Session {session.id}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  session.type === 'meterpreter'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-green-500/20 text-green-400'
                }`}
              >
                {session.type}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {session.session_host || session.tunnel_peer}
              {session.username && ` - ${session.username}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-msf-red transition-colors"
            title="Close Terminal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 bg-[#0d1117]"
        style={{ padding: '8px' }}
      />

      {/* Footer */}
      <div className="px-4 py-2 bg-msf-darker border-t border-msf-border">
        <p className="text-xs text-gray-500">
          Use <kbd className="px-1 bg-msf-card rounded">↑</kbd>/<kbd className="px-1 bg-msf-card rounded">↓</kbd> for command history |{' '}
          <kbd className="px-1 bg-msf-card rounded">Ctrl+C</kbd> to cancel
        </p>
      </div>
    </div>
  )
}

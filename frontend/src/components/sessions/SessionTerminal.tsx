import { useEffect, useRef, useState } from 'react'
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
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const sessionType = session.type === 'meterpreter' ? 'meterpreter' : 'shell'

  // Styled prompts with colors
  const getPrompt = () => {
    if (session.type === 'meterpreter') {
      return '\x1b[1;35mmeterpreter\x1b[0m > ' // Bold magenta
    }
    return '\x1b[1;32mshell\x1b[0m > ' // Bold green
  }

  const getSessionIcon = () => {
    if (session.platform?.toLowerCase().includes('windows')) {
      return <Monitor className="w-4 h-4" />
    }
    if (session.platform?.toLowerCase().includes('linux')) {
      return <Server className="w-4 h-4" />
    }
    return <Globe className="w-4 h-4" />
  }

  useEffect(() => {
    if (!terminalRef.current) return

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

    // Write initial prompt
    const prompt = getPrompt()
    terminal.write(prompt)

    // State for input handling (stored outside React for closure access)
    let inputBuffer = ''
    let cursorPos = 0
    const commandHistory: string[] = []
    let historyIndex = -1

    // Helper to redraw the current input line with prompt
    const redrawInput = () => {
      terminal.write('\r\x1b[K') // Clear line
      terminal.write(prompt) // Write prompt
      terminal.write(inputBuffer) // Write input
      if (cursorPos < inputBuffer.length) {
        terminal.write(`\x1b[${inputBuffer.length - cursorPos}D`)
      }
    }

    // Handle arrow keys for history and cursor movement
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      if (event.key === 'ArrowUp') {
        if (commandHistory.length > 0) {
          if (historyIndex === -1) {
            historyIndex = commandHistory.length - 1
          } else if (historyIndex > 0) {
            historyIndex--
          }
          inputBuffer = commandHistory[historyIndex]
          cursorPos = inputBuffer.length
          redrawInput()
        }
        return false
      }

      if (event.key === 'ArrowDown') {
        if (historyIndex !== -1) {
          if (historyIndex < commandHistory.length - 1) {
            historyIndex++
            inputBuffer = commandHistory[historyIndex]
          } else {
            historyIndex = -1
            inputBuffer = ''
          }
          cursorPos = inputBuffer.length
          redrawInput()
        }
        return false
      }

      if (event.key === 'ArrowLeft') {
        if (cursorPos > 0) {
          cursorPos--
          terminal.write('\x1b[D')
        }
        return false
      }

      if (event.key === 'ArrowRight') {
        if (cursorPos < inputBuffer.length) {
          cursorPos++
          terminal.write('\x1b[C')
        }
        return false
      }

      if (event.key === 'Home') {
        if (cursorPos > 0) {
          terminal.write(`\x1b[${cursorPos}D`)
          cursorPos = 0
        }
        return false
      }

      if (event.key === 'End') {
        if (cursorPos < inputBuffer.length) {
          terminal.write(`\x1b[${inputBuffer.length - cursorPos}C`)
          cursorPos = inputBuffer.length
        }
        return false
      }

      return true
    })

    // Handle character input
    terminal.onData((data) => {
      if (data === '\r') {
        if (inputBuffer.trim()) {
          commandHistory.push(inputBuffer)
        }
        historyIndex = -1
        terminal.write('\r\n') // Move to new line
        socketService.sendSessionInput(session.id, inputBuffer, sessionType)
        inputBuffer = ''
        cursorPos = 0
        // Prompt will be written by the output handler after response arrives
      } else if (data === '\x7f' || data === '\b') {
        if (cursorPos > 0) {
          inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos)
          cursorPos--
          terminal.write('\b')
          terminal.write(inputBuffer.slice(cursorPos) + ' ')
          terminal.write(`\x1b[${inputBuffer.length - cursorPos + 1}D`)
        }
      } else if (data === '\x03') {
        socketService.sendSessionInput(session.id, '\x03', sessionType)
        inputBuffer = ''
        cursorPos = 0
        terminal.write('^C\r\n')
      } else if (data.charCodeAt(0) >= 32 && !data.startsWith('\x1b')) {
        inputBuffer = inputBuffer.slice(0, cursorPos) + data + inputBuffer.slice(cursorPos)
        cursorPos += data.length
        terminal.write(data + inputBuffer.slice(cursorPos))
        if (cursorPos < inputBuffer.length) {
          terminal.write(`\x1b[${inputBuffer.length - cursorPos}D`)
        }
      }
    })

    // Track if we need to write a prompt after output
    let outputReceived = false
    let promptTimer: ReturnType<typeof setTimeout> | null = null

    // Subscribe to session output
    const unsubscribe = socketService.subscribeSessionOutput(
      session.id,
      sessionType,
      (data) => {
        if (data.closed) {
          terminal.writeln('\r\n\x1b[31m[Session closed]\x1b[0m')
        } else if (data.data) {
          outputReceived = true
          const normalizedData = data.data.replace(/\r?\n/g, '\r\n')
          terminal.write(normalizedData)

          // Debounce prompt writing - wait for output to settle
          if (promptTimer) clearTimeout(promptTimer)
          promptTimer = setTimeout(() => {
            if (outputReceived) {
              // Ensure we're on a new line
              terminal.write('\r\n')
              terminal.write(prompt)
              outputReceived = false
            }
          }, 100)
        }
      }
    )
    unsubscribeRef.current = unsubscribe

    return () => {
      if (promptTimer) clearTimeout(promptTimer)
      unsubscribe()
      terminal.dispose()
    }
  }, [session, sessionType])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)
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
          <kbd className="px-1 bg-msf-card rounded">↑</kbd>/<kbd className="px-1 bg-msf-card rounded">↓</kbd> history |{' '}
          <kbd className="px-1 bg-msf-card rounded">←</kbd>/<kbd className="px-1 bg-msf-card rounded">→</kbd> edit |{' '}
          <kbd className="px-1 bg-msf-card rounded">Ctrl+C</kbd> cancel
        </p>
      </div>
    </div>
  )
}

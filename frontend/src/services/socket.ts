import { io, Socket } from 'socket.io-client'
import { Session } from '../types'

type SessionCallback = (sessions: Record<string, Session>) => void
type ConsoleCallback = (data: { console_id: string; data: string; prompt: string; busy: boolean }) => void
type SessionEventCallback = (data: { session_id: string; info?: Session }) => void
type SessionOutputCallback = (data: { session_id: number; data?: string; type?: string; closed?: boolean }) => void

class SocketService {
  private socket: Socket | null = null
  private sessionCallbacks: SessionCallback[] = []
  private consoleCallbacks: Map<string, ConsoleCallback[]> = new Map()
  private sessionOpenCallbacks: SessionEventCallback[] = []
  private sessionCloseCallbacks: SessionEventCallback[] = []
  private sessionOutputCallbacks: Map<number, SessionOutputCallback[]> = new Map()
  private serverUrl: string = '/'

  setServerUrl(url: string) {
    this.serverUrl = url
  }

  connect() {
    if (this.socket?.connected) return

    this.socket = io(this.serverUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    })

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id)
    })

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected')
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    // Session events
    this.socket.on('sessions_update', (data: { sessions: Record<string, Session> }) => {
      this.sessionCallbacks.forEach((cb) => cb(data.sessions))
    })

    this.socket.on('session_opened', (data: { session_id: string; info: Session }) => {
      this.sessionOpenCallbacks.forEach((cb) => cb(data))
    })

    this.socket.on('session_closed', (data: { session_id: string }) => {
      this.sessionCloseCallbacks.forEach((cb) => cb(data))
    })

    // Console events
    this.socket.on('console_output', (data: { console_id: string; data: string; prompt: string; busy: boolean }) => {
      const callbacks = this.consoleCallbacks.get(data.console_id) || []
      callbacks.forEach((cb) => cb(data))
    })

    this.socket.on('console_created', (data: { console_id: string }) => {
      console.log('Console created:', data.console_id)
    })

    // Session output events
    this.socket.on('session_output', (data: { session_id: number; data?: string; type?: string; closed?: boolean }) => {
      const callbacks = this.sessionOutputCallbacks.get(data.session_id) || []
      callbacks.forEach((cb) => cb(data))
    })
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
  }

  // Session subscriptions
  subscribeSessions() {
    this.socket?.emit('subscribe_sessions', {})
  }

  onSessionsUpdate(callback: SessionCallback) {
    this.sessionCallbacks.push(callback)
    return () => {
      this.sessionCallbacks = this.sessionCallbacks.filter((cb) => cb !== callback)
    }
  }

  onSessionOpened(callback: SessionEventCallback) {
    this.sessionOpenCallbacks.push(callback)
    return () => {
      this.sessionOpenCallbacks = this.sessionOpenCallbacks.filter((cb) => cb !== callback)
    }
  }

  onSessionClosed(callback: SessionEventCallback) {
    this.sessionCloseCallbacks.push(callback)
    return () => {
      this.sessionCloseCallbacks = this.sessionCloseCallbacks.filter((cb) => cb !== callback)
    }
  }

  // Console management
  createConsole(): Promise<string> {
    return new Promise((resolve) => {
      this.socket?.once('console_created', (data: { console_id: string }) => {
        resolve(data.console_id)
      })
      this.socket?.emit('create_console', {})
    })
  }

  destroyConsole(consoleId: string) {
    this.socket?.emit('destroy_console', { console_id: consoleId })
    this.consoleCallbacks.delete(consoleId)
  }

  sendConsoleInput(consoleId: string, command: string) {
    this.socket?.emit('console_input', { console_id: consoleId, command })
  }

  onConsoleOutput(consoleId: string, callback: ConsoleCallback) {
    if (!this.consoleCallbacks.has(consoleId)) {
      this.consoleCallbacks.set(consoleId, [])
    }
    this.consoleCallbacks.get(consoleId)!.push(callback)

    return () => {
      const callbacks = this.consoleCallbacks.get(consoleId) || []
      this.consoleCallbacks.set(
        consoleId,
        callbacks.filter((cb) => cb !== callback)
      )
    }
  }

  // Session interaction
  sendSessionInput(sessionId: number, command: string, type: 'shell' | 'meterpreter' = 'shell') {
    this.socket?.emit('session_input', { session_id: sessionId, command, type })
  }

  // Session output subscription
  subscribeSessionOutput(
    sessionId: number,
    type: 'shell' | 'meterpreter',
    callback: SessionOutputCallback
  ) {
    if (!this.sessionOutputCallbacks.has(sessionId)) {
      this.sessionOutputCallbacks.set(sessionId, [])
      this.socket?.emit('subscribe_session_output', { session_id: sessionId, type })
    }
    this.sessionOutputCallbacks.get(sessionId)!.push(callback)

    return () => {
      const callbacks = this.sessionOutputCallbacks.get(sessionId) || []
      this.sessionOutputCallbacks.set(
        sessionId,
        callbacks.filter((cb) => cb !== callback)
      )
      // Unsubscribe if no more callbacks
      if (this.sessionOutputCallbacks.get(sessionId)?.length === 0) {
        this.socket?.emit('unsubscribe_session_output', { session_id: sessionId })
        this.sessionOutputCallbacks.delete(sessionId)
      }
    }
  }

  unsubscribeSessionOutput(sessionId: number) {
    this.socket?.emit('unsubscribe_session_output', { session_id: sessionId })
    this.sessionOutputCallbacks.delete(sessionId)
  }
}

export const socketService = new SocketService()

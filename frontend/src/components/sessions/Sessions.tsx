import { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { socketService } from '../../services/socket'
import { Session } from '../../types'
import SessionTerminal from './SessionTerminal'
import {
  Users,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Monitor,
  Server,
  Globe,
  RefreshCw,
} from 'lucide-react'

export default function Sessions() {
  const { sessions, fetchSessions, killSession, updateSessions } =
    useSessionStore()
  const [expandedSession, setExpandedSession] = useState<number | null>(null)
  const [sessionOutput, setSessionOutput] = useState<Record<number, string>>({})
  const [commandInput, setCommandInput] = useState('')
  const [terminalSession, setTerminalSession] = useState<Session | null>(null)

  useEffect(() => {
    fetchSessions()
    const unsubscribe = socketService.onSessionsUpdate(updateSessions)
    return () => unsubscribe()
  }, [fetchSessions, updateSessions])

  const toggleExpand = (id: number) => {
    setExpandedSession(expandedSession === id ? null : id)
  }

  const handleCommand = async (session: Session) => {
    if (!commandInput.trim()) return

    const output = sessionOutput[session.id] || ''
    setSessionOutput({
      ...sessionOutput,
      [session.id]: output + `\n> ${commandInput}\n`,
    })

    socketService.sendSessionInput(
      session.id,
      commandInput,
      session.type === 'meterpreter' ? 'meterpreter' : 'shell'
    )
    setCommandInput('')
  }

  const getSessionIcon = (session: Session) => {
    if (session.platform?.toLowerCase().includes('windows')) {
      return <Monitor className="w-5 h-5" />
    }
    if (session.platform?.toLowerCase().includes('linux')) {
      return <Server className="w-5 h-5" />
    }
    return <Globe className="w-5 h-5" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sessions</h1>
          <p className="text-gray-400 mt-1">Manage active sessions and interactions</p>
        </div>
        <button onClick={() => fetchSessions()} className="btn btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="bg-msf-card border border-msf-border rounded-lg p-12 text-center">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-500" />
          <h2 className="text-xl font-semibold text-white mb-2">No Active Sessions</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Create a listener and execute a payload on your target to establish a session.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-msf-card border border-msf-border rounded-lg overflow-hidden"
            >
              {/* Session Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-msf-darker"
                onClick={() => toggleExpand(session.id)}
              >
                <div className="flex items-center gap-4">
                  <button className="text-gray-400">
                    {expandedSession === session.id ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>
                  <div className="status-dot active" />
                  <div className="p-2 bg-msf-darker rounded-lg">
                    {getSessionIcon(session)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">Session {session.id}</span>
                      <span
                        className={`badge ${
                          session.type === 'meterpreter' ? 'badge-meterpreter' : 'badge-shell'
                        }`}
                      >
                        {session.type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {session.session_host || session.tunnel_peer}
                      {session.username && ` - ${session.username}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setTerminalSession(session)
                    }}
                    className="p-2 text-gray-400 hover:text-msf-blue transition-colors"
                    title="Open Terminal"
                  >
                    <Terminal className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('Are you sure you want to kill this session?')) {
                        killSession(session.id)
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-msf-red transition-colors"
                    title="Kill Session"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedSession === session.id && (
                <div className="border-t border-msf-border">
                  {/* Session Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-msf-darker/50">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Target Host</p>
                      <p className="text-sm text-white">{session.target_host || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Tunnel</p>
                      <p className="text-sm text-white">{session.tunnel_peer || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Platform</p>
                      <p className="text-sm text-white">{session.platform || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Architecture</p>
                      <p className="text-sm text-white">{session.arch || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Via Exploit</p>
                      <p className="text-sm text-white truncate" title={session.via_exploit}>
                        {session.via_exploit || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Via Payload</p>
                      <p className="text-sm text-white truncate" title={session.via_payload}>
                        {session.via_payload || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Username</p>
                      <p className="text-sm text-white">{session.username || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">UUID</p>
                      <p className="text-sm text-white font-mono text-xs">{session.uuid || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Quick Command Input */}
                  <div className="p-4 border-t border-msf-border">
                    <p className="text-sm text-gray-400 mb-2">Quick Command</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommand(session)}
                        placeholder={`Enter ${session.type} command...`}
                        className="input flex-1"
                      />
                      <button
                        onClick={() => handleCommand(session)}
                        className="btn btn-primary"
                      >
                        Run
                      </button>
                    </div>
                    {sessionOutput[session.id] && (
                      <pre className="mt-3 p-3 bg-msf-darker rounded-lg text-sm text-gray-300 font-mono overflow-x-auto max-h-48">
                        {sessionOutput[session.id]}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Session Terminal */}
      {terminalSession && (
        <SessionTerminal
          session={terminalSession}
          onClose={() => setTerminalSession(null)}
        />
      )}
    </div>
  )
}

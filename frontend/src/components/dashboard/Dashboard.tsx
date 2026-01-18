import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessionStore } from '../../store/sessionStore'
import { useModuleStore } from '../../store/moduleStore'
import { useListenerStore } from '../../store/listenerStore'
import { socketService } from '../../services/socket'
import {
  Users,
  Box,
  Radio,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  Terminal,
  ArrowRight,
} from 'lucide-react'

export default function Dashboard() {
  const { sessions, fetchSessions, updateSessions } = useSessionStore()
  const { stats, fetchStats } = useModuleStore()
  const { jobs, fetchJobs } = useListenerStore()
  const [msfConnected, setMsfConnected] = useState(false)

  useEffect(() => {
    fetchSessions()
    fetchStats()
    fetchJobs()

    // Check MSF connection
    fetch('/api/v1/modules/stats')
      .then((res) => {
        if (res.ok) {
          setMsfConnected(true)
        } else {
          setMsfConnected(false)
        }
      })
      .catch(() => setMsfConnected(false))

    // Subscribe to session updates
    const unsubscribe = socketService.onSessionsUpdate(updateSessions)
    return () => unsubscribe()
  }, [fetchSessions, fetchStats, fetchJobs, updateSessions])

  const statCards = [
    {
      label: 'Active Sessions',
      value: sessions.length,
      icon: Users,
      color: 'text-msf-accent',
      bgColor: 'bg-msf-accent/20',
      link: '/sessions',
    },
    {
      label: 'Running Listeners',
      value: jobs.length,
      icon: Radio,
      color: 'text-msf-blue',
      bgColor: 'bg-msf-blue/20',
      link: '/listeners',
    },
    {
      label: 'Total Exploits',
      value: stats?.exploits || 0,
      icon: Box,
      color: 'text-msf-red',
      bgColor: 'bg-msf-red/20',
      link: '/modules',
    },
    {
      label: 'Total Payloads',
      value: stats?.payloads || 0,
      icon: Shield,
      color: 'text-msf-purple',
      bgColor: 'bg-msf-purple/20',
      link: '/payloads',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Welcome to Metasploit GUI</p>
        </div>
        <div className="flex items-center gap-2">
          {msfConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-msf-accent/20 text-msf-accent rounded-full text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>MSF Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-msf-red/20 text-msf-red rounded-full text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>MSF Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="bg-msf-card border border-msf-border rounded-lg p-5 card-hover"
            >
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500" />
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-white">{stat.value.toLocaleString()}</p>
                <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Quick Actions & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-msf-card border border-msf-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/listeners"
              className="flex items-center gap-3 p-4 bg-msf-darker rounded-lg hover:bg-msf-border transition-colors"
            >
              <Radio className="w-5 h-5 text-msf-blue" />
              <span className="text-sm text-white">Create Listener</span>
            </Link>
            <Link
              to="/payloads"
              className="flex items-center gap-3 p-4 bg-msf-darker rounded-lg hover:bg-msf-border transition-colors"
            >
              <Shield className="w-5 h-5 text-msf-purple" />
              <span className="text-sm text-white">Generate Payload</span>
            </Link>
            <Link
              to="/modules"
              className="flex items-center gap-3 p-4 bg-msf-darker rounded-lg hover:bg-msf-border transition-colors"
            >
              <Box className="w-5 h-5 text-msf-red" />
              <span className="text-sm text-white">Browse Exploits</span>
            </Link>
            <Link
              to="/terminal"
              className="flex items-center gap-3 p-4 bg-msf-darker rounded-lg hover:bg-msf-border transition-colors"
            >
              <Terminal className="w-5 h-5 text-msf-accent" />
              <span className="text-sm text-white">Open Console</span>
            </Link>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="bg-msf-card border border-msf-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Active Sessions</h2>
            <Link to="/sessions" className="text-sm text-msf-blue hover:underline">
              View all
            </Link>
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active sessions</p>
              <p className="text-sm mt-1">Create a listener and wait for connections</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-msf-darker rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="status-dot active" />
                    <div>
                      <p className="text-sm text-white font-medium">
                        Session {session.id}
                      </p>
                      <p className="text-xs text-gray-400">
                        {session.session_host || session.tunnel_peer}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      session.type === 'meterpreter' ? 'badge-meterpreter' : 'badge-shell'
                    }`}
                  >
                    {session.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Module Stats */}
      {stats && (
        <div className="bg-msf-card border border-msf-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Module Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Exploits', value: stats.exploits, color: 'text-msf-red' },
              { label: 'Payloads', value: stats.payloads, color: 'text-msf-purple' },
              { label: 'Auxiliary', value: stats.auxiliaries, color: 'text-msf-yellow' },
              { label: 'Post', value: stats.post, color: 'text-msf-accent' },
              { label: 'Encoders', value: stats.encoders, color: 'text-msf-blue' },
              { label: 'NOPs', value: stats.nops, color: 'text-gray-400' },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 bg-msf-darker rounded-lg">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

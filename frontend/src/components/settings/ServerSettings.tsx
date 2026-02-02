import { useState, useEffect } from 'react'
import { Server, Check, AlertCircle, Loader2 } from 'lucide-react'
import { serverConfig } from '../../services/serverConfig'
import { api } from '../../services/api'
import axios from 'axios'

interface ServerSettingsProps {
  onClose?: () => void
}

export default function ServerSettings({ onClose }: ServerSettingsProps) {
  const [serverUrl, setServerUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCurrentUrl()
  }, [])

  const loadCurrentUrl = async () => {
    const url = await serverConfig.getServerUrl()
    setServerUrl(url)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const testUrl = serverUrl.replace(/\/$/, '')
      const response = await axios.get(`${testUrl}/health`, {
        timeout: 5000,
      })
      if (response.status === 200) {
        setTestResult({ success: true, message: 'Connection successful' })
      } else {
        setTestResult({
          success: false,
          message: `Server returned ${response.status}`,
        })
      }
    } catch (error) {
      let message = 'Connection failed'
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          message = 'Connection timed out'
        } else if (error.response) {
          message = `Server returned ${error.response.status}`
        } else if (error.request) {
          message = 'No response from server'
        } else {
          message = error.message
        }
      } else if (error instanceof Error) {
        message = error.message
      }
      setTestResult({
        success: false,
        message,
      })
    } finally {
      setTesting(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      await serverConfig.setServerUrl(serverUrl)
      api.updateBaseUrl(serverConfig.getApiBaseUrl())
      if (onClose) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-msf-card rounded-lg border border-msf-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <Server className="w-6 h-6 text-msf-blue" />
        <h2 className="text-lg font-semibold text-white">Server Configuration</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Backend Server URL
          </label>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value)
              setTestResult(null)
            }}
            placeholder="http://192.168.1.100:8000"
            className="input"
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter the URL of your Metasploit GUI backend server
          </p>
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {testResult.success ? (
              <Check className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            <span className={testResult.success ? 'text-green-400' : 'text-red-400'}>
              {testResult.message}
            </span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={testConnection}
            disabled={testing || !serverUrl}
            className="btn btn-secondary flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            Test Connection
          </button>

          <button
            onClick={saveSettings}
            disabled={saving || !serverUrl}
            className="btn btn-primary flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

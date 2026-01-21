import { useEffect, useState } from 'react'
import { useListenerStore } from '../../store/listenerStore'
import { api } from '../../services/api'
import { notify } from '../../hooks/useNotifications'
import { Radio, Plus, Trash2, RefreshCw, X, Play, Server } from 'lucide-react'

interface CommonPayload {
  name: string
  platform: string
  arch: string
  type: string
  staged: boolean
}

export default function Listeners() {
  const { jobs, fetchJobs, createHandler, killJob } = useListenerStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [commonPayloads, setCommonPayloads] = useState<CommonPayload[]>([])
  const [formData, setFormData] = useState({
    payload: 'windows/x64/meterpreter/reverse_tcp',
    lhost: '',
    lport: '4444',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJobs()
    // Fetch common payloads
    api.getCommonPayloads().then((data) => setCommonPayloads(data.payloads))

    // Try to get local IP
    fetch('/health')
      .then(() => {
        // In a real app, we'd get the actual interface IP
        setFormData((f) => ({ ...f, lhost: '0.0.0.0' }))
      })
      .catch(() => {})
  }, [fetchJobs])

  const handleCreate = async () => {
    if (!formData.lhost || !formData.lport) {
      setError('LHOST and LPORT are required')
      return
    }

    setCreating(true)
    setError('')

    try {
      await createHandler(formData.payload, formData.lhost, parseInt(formData.lport))
      notify.listenerStarted(formData.payload, parseInt(formData.lport))
      setShowCreateModal(false)
      setFormData({ ...formData, lport: String(parseInt(formData.lport) + 1) })
    } catch (e) {
      notify.error('Handler Failed', 'Failed to create handler')
      setError('Failed to create handler')
    } finally {
      setCreating(false)
    }
  }

  const groupedPayloads = commonPayloads.reduce((acc, p) => {
    if (!acc[p.platform]) acc[p.platform] = []
    acc[p.platform].push(p)
    return acc
  }, {} as Record<string, CommonPayload[]>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Listeners</h1>
          <p className="text-gray-400 mt-1">Manage handlers and listeners</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => fetchJobs()} className="btn btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Handler
          </button>
        </div>
      </div>

      {/* Active Listeners */}
      {jobs.length === 0 ? (
        <div className="bg-msf-card border border-msf-border rounded-lg p-12 text-center">
          <Radio className="w-16 h-16 mx-auto mb-4 text-gray-500" />
          <h2 className="text-xl font-semibold text-white mb-2">No Active Listeners</h2>
          <p className="text-gray-400 max-w-md mx-auto mb-6">
            Create a handler to listen for incoming connections from your payloads.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Handler
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-msf-card border border-msf-border rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-msf-blue/20 rounded-lg">
                  <Server className="w-6 h-6 text-msf-blue" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Job {job.id}</span>
                    <div className="status-dot active" />
                  </div>
                  <p className="text-sm text-gray-400">{job.name}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to kill this job?')) {
                    killJob(job.id)
                    notify.info('Listener Stopped', `Job ${job.id} has been terminated`)
                  }
                }}
                className="p-2 text-gray-400 hover:text-msf-red transition-colors"
                title="Kill Job"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Handler Templates */}
      <div className="bg-msf-card border border-msf-border rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: 'Windows x64 Meterpreter', payload: 'windows/x64/meterpreter/reverse_tcp' },
            { name: 'Windows x86 Meterpreter', payload: 'windows/meterpreter/reverse_tcp' },
            { name: 'Linux x64 Meterpreter', payload: 'linux/x64/meterpreter/reverse_tcp' },
            { name: 'Python Meterpreter', payload: 'python/meterpreter/reverse_tcp' },
            { name: 'PHP Meterpreter', payload: 'php/meterpreter/reverse_tcp' },
            { name: 'Generic Shell', payload: 'generic/shell_reverse_tcp' },
          ].map((template) => (
            <button
              key={template.payload}
              onClick={() => {
                setFormData({ ...formData, payload: template.payload })
                setShowCreateModal(true)
              }}
              className="p-3 bg-msf-darker rounded-lg hover:bg-msf-border transition-colors text-left"
            >
              <p className="text-sm text-white font-medium">{template.name}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono truncate">{template.payload}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Create Handler Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
            <div className="p-4 border-b border-msf-border flex items-center justify-between">
              <h3 className="font-semibold text-white">Create Handler</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-msf-red/20 border border-msf-red/50 rounded-lg text-msf-red text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-300 mb-2">Payload</label>
                <select
                  value={formData.payload}
                  onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                  className="select"
                >
                  {Object.entries(groupedPayloads).map(([platform, payloads]) => (
                    <optgroup key={platform} label={platform}>
                      {payloads.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.arch}, {p.staged ? 'staged' : 'stageless'})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    LHOST <span className="text-msf-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lhost}
                    onChange={(e) => setFormData({ ...formData, lhost: e.target.value })}
                    placeholder="0.0.0.0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    LPORT <span className="text-msf-red">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.lport}
                    onChange={(e) => setFormData({ ...formData, lport: e.target.value })}
                    placeholder="4444"
                    className="input"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-msf-border flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn btn-primary flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {creating ? 'Creating...' : 'Start Handler'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

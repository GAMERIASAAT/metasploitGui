import { useEffect, useState, useCallback } from 'react'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'
import { Workflow, WorkflowTemplate, ActivityLogEntry } from '../../types'
import {
  Zap,
  Play,
  Pause,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  Terminal,
  X,
  Settings,
} from 'lucide-react'

type TabType = 'workflows' | 'templates' | 'activity'

const STATUS_ICONS = {
  draft: FileText,
  ready: Settings,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  paused: Pause,
}

const STATUS_COLORS = {
  draft: 'text-gray-400',
  ready: 'text-msf-blue',
  running: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-msf-red',
  paused: 'text-orange-400',
}

export default function Automation() {
  const { sessions, fetchSessions } = useSessionStore()
  const [activeTab, setActiveTab] = useState<TabType>('workflows')
  const [isLoading, setIsLoading] = useState(false)

  // Workflows state
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)

  // Activity log state
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [activityFilter, setActivityFilter] = useState<string>('')

  // Create workflow modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    target_session: undefined as number | undefined,
    target_host: '',
    template_id: '',
  })

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getWorkflows()
      setWorkflows(data.workflows)
    } catch (e) {
      console.error('Failed to load workflows:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.getWorkflowTemplates()
      setTemplates(data.templates)
    } catch (e) {
      console.error('Failed to load templates:', e)
    }
  }, [])

  const loadActivityLog = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getActivityLog(200, activityFilter || undefined)
      setActivityLog(data.entries)
    } catch (e) {
      console.error('Failed to load activity log:', e)
    } finally {
      setIsLoading(false)
    }
  }, [activityFilter])

  useEffect(() => {
    fetchSessions()
    loadWorkflows()
    loadTemplates()
  }, [fetchSessions, loadWorkflows, loadTemplates])

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLog()
    }
  }, [activeTab, loadActivityLog])

  // Poll running workflows
  useEffect(() => {
    const hasRunning = workflows.some((w) => w.status === 'running')
    if (!hasRunning) return

    const interval = setInterval(loadWorkflows, 3000)
    return () => clearInterval(interval)
  }, [workflows, loadWorkflows])

  const handleCreateWorkflow = async () => {
    if (!newWorkflow.name) return
    setIsLoading(true)
    try {
      if (newWorkflow.template_id) {
        await api.createWorkflowFromTemplate(
          newWorkflow.template_id,
          newWorkflow.name,
          newWorkflow.target_session,
          newWorkflow.target_host || undefined
        )
      } else {
        await api.createWorkflow({
          name: newWorkflow.name,
          description: newWorkflow.description,
          target_session: newWorkflow.target_session,
          target_host: newWorkflow.target_host || undefined,
          steps: [],
        })
      }
      setShowCreateModal(false)
      setNewWorkflow({ name: '', description: '', target_session: undefined, target_host: '', template_id: '' })
      loadWorkflows()
    } catch (e) {
      console.error('Failed to create workflow:', e)
      alert('Failed to create workflow')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunWorkflow = async (workflowId: string) => {
    try {
      await api.runWorkflow(workflowId)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to run workflow:', e)
      alert('Failed to run workflow')
    }
  }

  const handleStopWorkflow = async (workflowId: string) => {
    try {
      await api.stopWorkflow(workflowId)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to stop workflow:', e)
    }
  }

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Delete this workflow?')) return
    try {
      await api.deleteWorkflow(workflowId)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to delete workflow:', e)
    }
  }

  const handleDuplicateWorkflow = async (workflowId: string) => {
    try {
      await api.duplicateWorkflow(workflowId)
      loadWorkflows()
    } catch (e) {
      console.error('Failed to duplicate workflow:', e)
    }
  }

  const getStepTypeIcon = (type: string) => {
    switch (type) {
      case 'command':
        return <Terminal className="w-4 h-4" />
      case 'delay':
        return <Clock className="w-4 h-4" />
      default:
        return <Zap className="w-4 h-4" />
    }
  }

  const meterpreterSessions = sessions.filter((s) => s.type === 'meterpreter')

  const tabs = [
    { id: 'workflows' as TabType, label: 'Workflows', icon: Zap },
    { id: 'templates' as TabType, label: 'Templates', icon: FileText },
    { id: 'activity' as TabType, label: 'Activity Log', icon: Clock },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation</h1>
          <p className="text-gray-400 mt-1">Create and run automated workflows</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadWorkflows} className="btn btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-msf-border">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-msf-accent border-b-2 border-msf-accent'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="bg-msf-card border border-msf-border rounded-lg">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-msf-accent animate-spin" />
          </div>
        )}

        {/* Workflows Tab */}
        {activeTab === 'workflows' && !isLoading && (
          <div className="divide-y divide-msf-border">
            {workflows.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No workflows yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn btn-primary btn-sm mt-4"
                >
                  Create your first workflow
                </button>
              </div>
            ) : (
              workflows.map((workflow) => {
                const StatusIcon = STATUS_ICONS[workflow.status] || FileText
                const isExpanded = expandedWorkflow === workflow.id
                const isRunning = workflow.status === 'running'

                return (
                  <div key={workflow.id}>
                    <div
                      className="p-4 hover:bg-msf-darker/50 cursor-pointer"
                      onClick={() => setExpandedWorkflow(isExpanded ? null : workflow.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <StatusIcon
                            className={`w-5 h-5 ${STATUS_COLORS[workflow.status]} ${
                              isRunning ? 'animate-spin' : ''
                            }`}
                          />
                          <div>
                            <h3 className="text-white font-medium">{workflow.name}</h3>
                            <p className="text-sm text-gray-400">
                              {workflow.steps.length} steps
                              {workflow.target_session && ` • Session ${workflow.target_session}`}
                              {workflow.target_host && ` • ${workflow.target_host}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span
                            className={`text-xs px-2 py-1 rounded capitalize ${
                              STATUS_COLORS[workflow.status]
                            } bg-current/10`}
                          >
                            {workflow.status}
                          </span>
                          {(workflow.status === 'ready' || workflow.status === 'draft') && (
                            <button
                              onClick={() => handleRunWorkflow(workflow.id)}
                              className="p-1.5 text-green-400 hover:text-green-300"
                              title="Run"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {isRunning && (
                            <button
                              onClick={() => handleStopWorkflow(workflow.id)}
                              className="p-1.5 text-orange-400 hover:text-orange-300"
                              title="Stop"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicateWorkflow(workflow.id)}
                            className="p-1.5 text-gray-400 hover:text-white"
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkflow(workflow.id)}
                            className="p-1.5 text-gray-400 hover:text-msf-red"
                            title="Delete"
                            disabled={isRunning}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 bg-msf-darker/30">
                        <div className="pl-8 space-y-3">
                          {workflow.description && (
                            <p className="text-sm text-gray-400">{workflow.description}</p>
                          )}

                          {/* Steps */}
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-white">Steps</h4>
                            {workflow.steps.map((step, i) => {
                              const result = workflow.results?.find((r) => r.step_index === i)
                              const isCurrent = isRunning && workflow.current_step === i

                              return (
                                <div
                                  key={step.id || i}
                                  className={`flex items-center gap-3 p-2 rounded ${
                                    isCurrent
                                      ? 'bg-yellow-500/10 border border-yellow-500/30'
                                      : 'bg-msf-card'
                                  }`}
                                >
                                  <span className="text-xs text-gray-500 w-6">{i + 1}</span>
                                  {getStepTypeIcon(step.type)}
                                  <span className="text-white flex-1">{step.name}</span>
                                  {step.module && (
                                    <span className="text-xs text-gray-400 font-mono">
                                      {step.module}
                                    </span>
                                  )}
                                  {result && (
                                    <>
                                      {result.status === 'success' && (
                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                      )}
                                      {result.status === 'failed' && (
                                        <XCircle className="w-4 h-4 text-msf-red" />
                                      )}
                                      {result.status === 'running' && (
                                        <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                                      )}
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Results */}
                          {workflow.results && workflow.results.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-white">Results</h4>
                              <div className="bg-msf-dark rounded p-3 max-h-48 overflow-y-auto">
                                {workflow.results.map((result, i) => (
                                  <div key={i} className="mb-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-gray-400">{result.step_name}</span>
                                      <span
                                        className={
                                          result.status === 'success'
                                            ? 'text-green-400'
                                            : result.status === 'failed'
                                            ? 'text-msf-red'
                                            : 'text-yellow-400'
                                        }
                                      >
                                        [{result.status}]
                                      </span>
                                    </div>
                                    {result.output && (
                                      <pre className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">
                                        {result.output.slice(0, 500)}
                                      </pre>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {workflow.error && (
                            <div className="bg-msf-red/10 border border-msf-red/30 rounded p-3">
                              <p className="text-sm text-msf-red">{workflow.error}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && !isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-msf-darker rounded-lg p-4 border border-msf-border hover:border-msf-accent/50 transition-colors"
              >
                <h3 className="text-white font-medium">{template.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{template.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-500">{template.step_count} steps</span>
                  <button
                    onClick={() => {
                      setNewWorkflow({ ...newWorkflow, template_id: template.id, name: template.name })
                      setShowCreateModal(true)
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && !isLoading && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="input w-48"
              >
                <option value="">All Actions</option>
                <option value="workflow_started">Workflow Started</option>
                <option value="workflow_completed">Workflow Completed</option>
                <option value="workflow_failed">Workflow Failed</option>
                <option value="workflow_step">Workflow Step</option>
              </select>
              <button onClick={loadActivityLog} className="btn btn-secondary btn-sm">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {activityLog.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No activity recorded</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {activityLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 bg-msf-darker rounded-lg"
                  >
                    {entry.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                    )}
                    {entry.status === 'error' && (
                      <XCircle className="w-4 h-4 text-msf-red mt-0.5" />
                    )}
                    {entry.status === 'warning' && (
                      <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5" />
                    )}
                    {entry.status === 'info' && (
                      <Clock className="w-4 h-4 text-msf-blue mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{entry.action}</span>
                        {entry.session_id && (
                          <span className="text-xs text-gray-400">Session {entry.session_id}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 truncate">{entry.details}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white">Create Workflow</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewWorkflow({ name: '', description: '', target_session: undefined, target_host: '', template_id: '' })
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newWorkflow.name}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                  placeholder="My Workflow"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Description</label>
                <textarea
                  value={newWorkflow.description}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                  placeholder="What does this workflow do?"
                  className="input w-full h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Template</label>
                <select
                  value={newWorkflow.template_id}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, template_id: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Start from scratch</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Target Session</label>
                <select
                  value={newWorkflow.target_session || ''}
                  onChange={(e) =>
                    setNewWorkflow({
                      ...newWorkflow,
                      target_session: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="input w-full"
                >
                  <option value="">None (for exploits)</option>
                  {meterpreterSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      Session {s.id} - {s.info || s.session_host}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Target Host</label>
                <input
                  type="text"
                  value={newWorkflow.target_host}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, target_host: e.target.value })}
                  placeholder="192.168.1.1"
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-msf-border">
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewWorkflow({ name: '', description: '', target_session: undefined, target_host: '', template_id: '' })
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkflow}
                  disabled={!newWorkflow.name}
                  className="btn btn-primary"
                >
                  Create Workflow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

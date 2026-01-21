import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { Report, ReportConfig, ReportData } from '../../types'
import {
  FileText,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  Loader2,
  X,
  Monitor,
  Key,
  Clock,
  Radar,
  Zap,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react'

export default function Reports() {
  const [isLoading, setIsLoading] = useState(false)
  const [reports, setReports] = useState<Report[]>([])
  const [stats, setStats] = useState<{
    targets: { total: number; compromised: number; online: number }
    services: { total: number }
    credentials: { total: number; with_password: number; with_hash: number }
    workflows: { total: number; completed: number; running: number }
    scans: { total: number }
    activity: { total: number }
  } | null>(null)

  // Create report modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    name: '',
    description: '',
    type: 'engagement',
    include_targets: true,
    include_credentials: true,
    include_activity: true,
    include_scans: true,
    include_workflows: true,
  })

  // Preview
  const [previewData, setPreviewData] = useState<ReportData | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Expanded report
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getReports()
      setReports(data.reports)
    } catch (e) {
      console.error('Failed to load reports:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getEngagementStats()
      setStats(data)
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }, [])

  useEffect(() => {
    loadReports()
    loadStats()
  }, [loadReports, loadStats])

  const handleCreateReport = async () => {
    if (!reportConfig.name) return
    setIsLoading(true)
    try {
      await api.createReport(reportConfig)
      setShowCreateModal(false)
      setReportConfig({
        name: '',
        description: '',
        type: 'engagement',
        include_targets: true,
        include_credentials: true,
        include_activity: true,
        include_scans: true,
        include_workflows: true,
      })
      loadReports()
    } catch (e) {
      console.error('Failed to create report:', e)
      alert('Failed to create report')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePreview = async () => {
    setIsLoading(true)
    try {
      const data = await api.previewReport(reportConfig)
      setPreviewData(data)
      setShowPreview(true)
    } catch (e) {
      console.error('Failed to preview report:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportHtml = async (reportId: string, reportName: string) => {
    try {
      const blob = await api.exportReportHtml(reportId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportName}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export HTML:', e)
      alert('Failed to export report')
    }
  }

  const handleExportJson = async (reportId: string, reportName: string) => {
    try {
      const blob = await api.exportReportJson(reportId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportName}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export JSON:', e)
      alert('Failed to export report')
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Delete this report?')) return
    try {
      await api.deleteReport(reportId)
      loadReports()
    } catch (e) {
      console.error('Failed to delete report:', e)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-gray-400 mt-1">Generate and export engagement reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadReports} className="btn btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Report
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-msf-blue" />
              <span className="text-gray-400 text-sm">Targets</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stats.targets.total}</p>
            <p className="text-xs text-green-400">{stats.targets.compromised} compromised</p>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-yellow-400" />
              <span className="text-gray-400 text-sm">Credentials</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stats.credentials.total}</p>
            <p className="text-xs text-gray-400">{stats.credentials.with_password} passwords</p>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Radar className="w-5 h-5 text-purple-400" />
              <span className="text-gray-400 text-sm">Scans</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stats.scans.total}</p>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-msf-accent" />
              <span className="text-gray-400 text-sm">Workflows</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stats.workflows.total}</p>
            <p className="text-xs text-green-400">{stats.workflows.completed} completed</p>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-msf-blue" />
              <span className="text-gray-400 text-sm">Activities</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stats.activity.total}</p>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-400" />
              <span className="text-gray-400 text-sm">Reports</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{reports.length}</p>
          </div>
        </div>
      )}

      {/* Reports List */}
      <div className="bg-msf-card border border-msf-border rounded-lg">
        <div className="p-4 border-b border-msf-border">
          <h2 className="text-lg font-semibold text-white">Saved Reports</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-msf-accent animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No reports generated yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm mt-4"
            >
              Create your first report
            </button>
          </div>
        ) : (
          <div className="divide-y divide-msf-border">
            {reports.map((report) => {
              const isExpanded = expandedReport === report.id

              return (
                <div key={report.id}>
                  <div
                    className="p-4 hover:bg-msf-darker/50 cursor-pointer"
                    onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                        <FileText className="w-5 h-5 text-msf-accent" />
                        <div>
                          <h3 className="text-white font-medium">{report.name}</h3>
                          <p className="text-sm text-gray-400">
                            {new Date(report.created_at).toLocaleString()}
                            {report.created_by && ` • by ${report.created_by}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs px-2 py-1 bg-msf-blue/20 text-msf-blue rounded capitalize">
                          {report.type}
                        </span>
                        <button
                          onClick={() => handleExportHtml(report.id, report.name)}
                          className="p-1.5 text-gray-400 hover:text-white"
                          title="Export HTML"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-1.5 text-gray-400 hover:text-msf-red"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Summary */}
                  {isExpanded && report.data && (
                    <div className="px-4 pb-4 bg-msf-darker/30">
                      <div className="pl-8">
                        {report.description && (
                          <p className="text-sm text-gray-400 mb-3">{report.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {report.data.summary.total_targets !== undefined && (
                            <div className="bg-msf-card rounded p-3">
                              <p className="text-2xl font-bold text-white">
                                {report.data.summary.total_targets}
                              </p>
                              <p className="text-xs text-gray-400">Targets</p>
                            </div>
                          )}
                          {report.data.summary.compromised_targets !== undefined && (
                            <div className="bg-msf-card rounded p-3">
                              <p className="text-2xl font-bold text-msf-accent">
                                {report.data.summary.compromised_targets}
                              </p>
                              <p className="text-xs text-gray-400">Compromised</p>
                            </div>
                          )}
                          {report.data.summary.total_credentials !== undefined && (
                            <div className="bg-msf-card rounded p-3">
                              <p className="text-2xl font-bold text-yellow-400">
                                {report.data.summary.total_credentials}
                              </p>
                              <p className="text-xs text-gray-400">Credentials</p>
                            </div>
                          )}
                          {report.data.summary.total_activities !== undefined && (
                            <div className="bg-msf-card rounded p-3">
                              <p className="text-2xl font-bold text-msf-blue">
                                {report.data.summary.total_activities}
                              </p>
                              <p className="text-xs text-gray-400">Activities</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => handleExportHtml(report.id, report.name)}
                            className="btn btn-secondary btn-sm flex items-center gap-1"
                          >
                            <Download className="w-4 h-4" />
                            Export HTML
                          </button>
                          <button
                            onClick={() => handleExportJson(report.id, report.name)}
                            className="btn btn-secondary btn-sm flex items-center gap-1"
                          >
                            <Download className="w-4 h-4" />
                            Export JSON
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Report Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white">Create Report</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Report Name *</label>
                <input
                  type="text"
                  value={reportConfig.name}
                  onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })}
                  placeholder="Engagement Report - Q1 2026"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Description</label>
                <textarea
                  value={reportConfig.description}
                  onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })}
                  placeholder="Summary of the penetration test..."
                  className="input w-full h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Report Type</label>
                <select
                  value={reportConfig.type}
                  onChange={(e) => setReportConfig({ ...reportConfig, type: e.target.value })}
                  className="input w-full"
                >
                  <option value="engagement">Engagement Report</option>
                  <option value="executive">Executive Summary</option>
                  <option value="technical">Technical Report</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Include Sections</label>
                <div className="space-y-2">
                  {[
                    { key: 'include_targets', label: 'Targets & Services' },
                    { key: 'include_credentials', label: 'Credentials' },
                    { key: 'include_activity', label: 'Activity Log' },
                    { key: 'include_scans', label: 'Nmap Scans' },
                    { key: 'include_workflows', label: 'Workflows' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reportConfig[item.key as keyof ReportConfig] as boolean}
                        onChange={(e) =>
                          setReportConfig({ ...reportConfig, [item.key]: e.target.checked })
                        }
                        className="rounded border-gray-600"
                      />
                      <span className="text-gray-300">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Date From</label>
                  <input
                    type="date"
                    value={reportConfig.date_from || ''}
                    onChange={(e) => setReportConfig({ ...reportConfig, date_from: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Date To</label>
                  <input
                    type="date"
                    value={reportConfig.date_to || ''}
                    onChange={(e) => setReportConfig({ ...reportConfig, date_to: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-4 border-t border-msf-border">
                <button onClick={handlePreview} className="btn btn-secondary flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateReport}
                    disabled={!reportConfig.name}
                    className="btn btn-primary"
                  >
                    Create Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white">Report Preview</h2>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {previewData.summary.total_targets !== undefined && (
                  <div className="bg-msf-darker rounded p-3 text-center">
                    <p className="text-2xl font-bold text-white">{previewData.summary.total_targets}</p>
                    <p className="text-xs text-gray-400">Targets</p>
                  </div>
                )}
                {previewData.summary.compromised_targets !== undefined && (
                  <div className="bg-msf-darker rounded p-3 text-center">
                    <p className="text-2xl font-bold text-msf-accent">
                      {previewData.summary.compromised_targets}
                    </p>
                    <p className="text-xs text-gray-400">Compromised</p>
                  </div>
                )}
                {previewData.summary.total_credentials !== undefined && (
                  <div className="bg-msf-darker rounded p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-400">
                      {previewData.summary.total_credentials}
                    </p>
                    <p className="text-xs text-gray-400">Credentials</p>
                  </div>
                )}
                {previewData.summary.total_activities !== undefined && (
                  <div className="bg-msf-darker rounded p-3 text-center">
                    <p className="text-2xl font-bold text-msf-blue">
                      {previewData.summary.total_activities}
                    </p>
                    <p className="text-xs text-gray-400">Activities</p>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-400 text-center">
                Generated: {previewData.generated_at}
              </p>

              <div className="flex justify-end">
                <button onClick={() => setShowPreview(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

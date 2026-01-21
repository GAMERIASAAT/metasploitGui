import { useEffect, useState, useCallback } from 'react'
import { useTargetStore } from '../../store/targetStore'
import { api } from '../../services/api'
import { Target, TargetCreate, ServiceCreate } from '../../types'
import {
  Monitor,
  Plus,
  Trash2,
  Edit,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Radar,
  Loader2,
  Clock,
  CheckCircle2,
  XOctagon,
} from 'lucide-react'

interface ScanProfile {
  id: string
  name: string
  description: string
  args: string
}

interface NmapScan {
  id: string
  targets: string
  profile: string
  status: string
  created_at: string
  completed_at?: string
  results?: {
    hosts: Array<{
      ip: string
      hostname: string
      status: string
      os: string
      services: Array<{
        port: number
        protocol: string
        service: string
        version: string
      }>
    }>
    total_hosts: number
    hosts_up: number
  }
  imported?: number
  error?: string
}

const STATUS_ICONS = {
  unknown: HelpCircle,
  online: CheckCircle,
  offline: XCircle,
  compromised: AlertCircle,
}

const STATUS_COLORS = {
  unknown: 'text-gray-400',
  online: 'text-green-400',
  offline: 'text-red-400',
  compromised: 'text-msf-accent',
}

const OS_ICONS: Record<string, string> = {
  windows: '🪟',
  linux: '🐧',
  macos: '🍎',
  android: '🤖',
  ios: '📱',
  unknown: '❓',
}

export default function Targets() {
  const {
    targets,
    groups,
    filters,
    isLoading,
    stats,
    selectedTarget,
    fetchTargets,
    fetchStats,
    createTarget,
    updateTarget,
    deleteTarget,
    selectTarget,
    setFilters,
    clearFilters,
    addService,
    deleteService,
  } = useTargetStore()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Target | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set())
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null)

  // Nmap scan state
  const [scanProfiles, setScanProfiles] = useState<ScanProfile[]>([])
  const [scans, setScans] = useState<NmapScan[]>([])
  const [scanTarget, setScanTarget] = useState('')
  const [scanProfile, setScanProfile] = useState('quick')
  const [customArgs, setCustomArgs] = useState('')
  const [importResults, setImportResults] = useState(true)
  const [scanning, setScanning] = useState(false)

  // Form state
  const [formData, setFormData] = useState<TargetCreate>({
    ip: '',
    hostname: '',
    os: '',
    os_family: '',
    arch: '',
    status: 'unknown',
    tags: [],
    notes: '',
    group: '',
  })

  const [serviceForm, setServiceForm] = useState<ServiceCreate>({
    port: 0,
    protocol: 'tcp',
    service: '',
    version: '',
    state: 'open',
  })

  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    fetchTargets()
    fetchStats()
    loadScanProfiles()
  }, [fetchTargets, fetchStats])

  const loadScanProfiles = async () => {
    try {
      const data = await api.getNmapProfiles()
      setScanProfiles(data.profiles)
    } catch (e) {
      console.error('Failed to load scan profiles:', e)
    }
  }

  const loadScans = useCallback(async () => {
    try {
      const data = await api.getNmapScans()
      setScans(data.scans)
    } catch (e) {
      console.error('Failed to load scans:', e)
    }
  }, [])

  const handleStartScan = async () => {
    if (!scanTarget) return
    setScanning(true)
    try {
      await api.startNmapScan(
        scanTarget,
        scanProfile,
        scanProfile === 'custom' ? customArgs : undefined,
        importResults
      )
      await loadScans()
      // Poll for scan completion
      const pollInterval = setInterval(async () => {
        const data = await api.getNmapScans()
        setScans(data.scans)
        if (data.active === 0) {
          clearInterval(pollInterval)
          fetchTargets()
          fetchStats()
        }
      }, 2000)
    } catch (e) {
      console.error('Failed to start scan:', e)
      alert('Failed to start scan. Make sure nmap is installed.')
    } finally {
      setScanning(false)
    }
  }

  const resetForm = () => {
    setFormData({
      ip: '',
      hostname: '',
      os: '',
      os_family: '',
      arch: '',
      status: 'unknown',
      tags: [],
      notes: '',
      group: '',
    })
    setTagInput('')
    setEditingTarget(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingTarget) {
        await updateTarget(editingTarget.id, formData)
      } else {
        await createTarget(formData)
      }
      setShowAddModal(false)
      resetForm()
    } catch (err) {
      console.error('Failed to save target:', err)
    }
  }

  const handleEdit = (target: Target) => {
    setEditingTarget(target)
    setFormData({
      ip: target.ip,
      hostname: target.hostname || '',
      os: target.os || '',
      os_family: target.os_family || '',
      arch: target.arch || '',
      status: target.status,
      tags: target.tags,
      notes: target.notes || '',
      group: target.group || '',
    })
    setShowAddModal(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this target?')) {
      await deleteTarget(id)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] })
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) })
  }

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTarget) return
    try {
      await addService(selectedTarget.id, serviceForm)
      setShowServiceModal(false)
      setServiceForm({ port: 0, protocol: 'tcp', service: '', version: '', state: 'open' })
    } catch (err) {
      console.error('Failed to add service:', err)
    }
  }

  const toggleSelectTarget = (id: string) => {
    const newSelected = new Set(selectedTargets)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedTargets(newSelected)
  }

  const filteredTargets = targets.filter((t) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      t.ip.toLowerCase().includes(q) ||
      t.hostname?.toLowerCase().includes(q) ||
      t.os?.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Targets</h1>
          <p className="text-gray-400 mt-1">Manage target hosts and services</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchTargets()}
            className="btn btn-secondary flex items-center gap-2"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              loadScans()
              setShowScanModal(true)
            }}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Radar className="w-4 h-4" />
            Nmap Scan
          </button>
          <button
            onClick={() => {
              resetForm()
              setShowAddModal(true)
            }}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Target
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-msf-blue" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-sm text-gray-400">Total Hosts</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.by_status.online || 0}</p>
                <p className="text-sm text-gray-400">Online</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-msf-accent" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.by_status.compromised || 0}</p>
                <p className="text-sm text-gray-400">Compromised</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.by_status.offline || 0}</p>
                <p className="text-sm text-gray-400">Offline</p>
              </div>
            </div>
          </div>
          <div className="bg-msf-card border border-msf-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Server className="w-8 h-8 text-msf-purple" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.total_services}</p>
                <p className="text-sm text-gray-400">Services</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by IP, hostname, OS, or tag..."
            className="input pl-10 w-full"
          />
        </div>

        <select
          value={filters.status || ''}
          onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
          className="input w-40"
        >
          <option value="">All Status</option>
          <option value="unknown">Unknown</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="compromised">Compromised</option>
        </select>

        <select
          value={filters.group || ''}
          onChange={(e) => setFilters({ ...filters, group: e.target.value || undefined })}
          className="input w-40"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {(filters.status || filters.group || filters.tag) && (
          <button onClick={clearFilters} className="btn btn-secondary flex items-center gap-1">
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Targets List */}
      <div className="bg-msf-card border border-msf-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-msf-darker">
            <tr>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium w-8">
                <input
                  type="checkbox"
                  checked={selectedTargets.size === filteredTargets.length && filteredTargets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTargets(new Set(filteredTargets.map((t) => t.id)))
                    } else {
                      setSelectedTargets(new Set())
                    }
                  }}
                  className="rounded border-gray-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Host</th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">OS</th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Services</th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Tags</th>
              <th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Group</th>
              <th className="px-4 py-3 text-right text-sm text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTargets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  {isLoading ? (
                    'Loading targets...'
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Monitor className="w-12 h-12 text-gray-600" />
                      <p>No targets found</p>
                      <button
                        onClick={() => {
                          resetForm()
                          setShowAddModal(true)
                        }}
                        className="btn btn-primary btn-sm mt-2"
                      >
                        Add your first target
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredTargets.map((target) => {
                const StatusIcon = STATUS_ICONS[target.status]
                const isExpanded = expandedTarget === target.id
                return (
                  <>
                    <tr
                      key={target.id}
                      className="border-t border-msf-border hover:bg-msf-darker/50 cursor-pointer"
                      onClick={() => setExpandedTarget(isExpanded ? null : target.id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedTargets.has(target.id)}
                          onChange={() => toggleSelectTarget(target.id)}
                          className="rounded border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <div>
                            <p className="text-white font-mono">{target.ip}</p>
                            {target.hostname && (
                              <p className="text-sm text-gray-400">{target.hostname}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-300">
                          {OS_ICONS[target.os_family?.toLowerCase() || 'unknown']}{' '}
                          {target.os || target.os_family || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1 ${STATUS_COLORS[target.status]}`}>
                          <StatusIcon className="w-4 h-4" />
                          <span className="capitalize">{target.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-300">{target.services.length}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {target.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-msf-blue/20 text-msf-blue text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {target.tags.length > 3 && (
                            <span className="text-xs text-gray-400">+{target.tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-300">{target.group || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(target)}
                            className="p-1.5 text-gray-400 hover:text-white"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(target.id)}
                            className="p-1.5 text-gray-400 hover:text-msf-red"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${target.id}-expanded`} className="bg-msf-darker">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Details */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-white">Details</h4>
                              <div className="text-sm space-y-1">
                                <p>
                                  <span className="text-gray-400">Architecture:</span>{' '}
                                  <span className="text-white">{target.arch || '-'}</span>
                                </p>
                                <p>
                                  <span className="text-gray-400">Created:</span>{' '}
                                  <span className="text-white">
                                    {new Date(target.created_at).toLocaleString()}
                                  </span>
                                </p>
                                {target.notes && (
                                  <p>
                                    <span className="text-gray-400">Notes:</span>{' '}
                                    <span className="text-white">{target.notes}</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Services */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-white">Services</h4>
                                <button
                                  onClick={() => {
                                    selectTarget(target)
                                    setShowServiceModal(true)
                                  }}
                                  className="text-xs text-msf-blue hover:text-msf-blue/80"
                                >
                                  + Add Service
                                </button>
                              </div>
                              {target.services.length === 0 ? (
                                <p className="text-sm text-gray-400">No services discovered</p>
                              ) : (
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {target.services.map((svc) => (
                                    <div
                                      key={svc.id}
                                      className="flex items-center justify-between bg-msf-card px-2 py-1 rounded text-sm"
                                    >
                                      <span className="text-white">
                                        {svc.port}/{svc.protocol} - {svc.service || 'unknown'}
                                        {svc.version && (
                                          <span className="text-gray-400 ml-1">({svc.version})</span>
                                        )}
                                      </span>
                                      <button
                                        onClick={() => deleteService(target.id, svc.id)}
                                        className="text-gray-400 hover:text-msf-red"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Target Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white">
                {editingTarget ? 'Edit Target' : 'Add Target'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  resetForm()
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    IP Address <span className="text-msf-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    placeholder="192.168.1.1"
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Hostname</label>
                  <input
                    type="text"
                    value={formData.hostname}
                    onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                    placeholder="web-server-01"
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">OS</label>
                  <input
                    type="text"
                    value={formData.os}
                    onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                    placeholder="Windows 10 Pro"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">OS Family</label>
                  <select
                    value={formData.os_family}
                    onChange={(e) => setFormData({ ...formData, os_family: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select...</option>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                    <option value="macos">macOS</option>
                    <option value="android">Android</option>
                    <option value="ios">iOS</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Architecture</label>
                  <select
                    value={formData.arch}
                    onChange={(e) => setFormData({ ...formData, arch: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select...</option>
                    <option value="x64">x64</option>
                    <option value="x86">x86</option>
                    <option value="arm64">ARM64</option>
                    <option value="arm">ARM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input w-full"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="compromised">Compromised</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Group</label>
                <input
                  type="text"
                  value={formData.group}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  placeholder="Internal Network"
                  className="input w-full"
                  list="groups-list"
                />
                <datalist id="groups-list">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add tag..."
                    className="input flex-1"
                  />
                  <button type="button" onClick={handleAddTag} className="btn btn-secondary">
                    Add
                  </button>
                </div>
                {formData.tags && formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-msf-blue/20 text-msf-blue text-sm rounded flex items-center gap-1"
                      >
                        {tag}
                        <button type="button" onClick={() => handleRemoveTag(tag)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="input w-full h-20 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-msf-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    resetForm()
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTarget ? 'Save Changes' : 'Add Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showServiceModal && selectedTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white">Add Service to {selectedTarget.ip}</h2>
              <button
                onClick={() => setShowServiceModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddService} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Port <span className="text-msf-red">*</span>
                  </label>
                  <input
                    type="number"
                    value={serviceForm.port || ''}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, port: parseInt(e.target.value) || 0 })
                    }
                    placeholder="80"
                    className="input w-full"
                    required
                    min={1}
                    max={65535}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Protocol</label>
                  <select
                    value={serviceForm.protocol}
                    onChange={(e) => setServiceForm({ ...serviceForm, protocol: e.target.value })}
                    className="input w-full"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Service Name</label>
                <input
                  type="text"
                  value={serviceForm.service}
                  onChange={(e) => setServiceForm({ ...serviceForm, service: e.target.value })}
                  placeholder="http, ssh, ftp..."
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Version</label>
                <input
                  type="text"
                  value={serviceForm.version}
                  onChange={(e) => setServiceForm({ ...serviceForm, version: e.target.value })}
                  placeholder="Apache 2.4.41"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">State</label>
                <select
                  value={serviceForm.state}
                  onChange={(e) => setServiceForm({ ...serviceForm, state: e.target.value })}
                  className="input w-full"
                >
                  <option value="open">Open</option>
                  <option value="filtered">Filtered</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-msf-border">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nmap Scan Modal */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-msf-border">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Radar className="w-5 h-5 text-msf-accent" />
                Nmap Scanner
              </h2>
              <button
                onClick={() => setShowScanModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Scan Form */}
              <div className="bg-msf-darker rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-medium text-white">New Scan</h3>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Target(s) <span className="text-msf-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={scanTarget}
                    onChange={(e) => setScanTarget(e.target.value)}
                    placeholder="192.168.1.1, 192.168.1.0/24, or 192.168.1.1-50"
                    className="input w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter IP address, CIDR range, or IP range
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Scan Profile</label>
                  <select
                    value={scanProfile}
                    onChange={(e) => setScanProfile(e.target.value)}
                    className="input w-full"
                  >
                    {scanProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} - {profile.description}
                      </option>
                    ))}
                    <option value="custom">Custom Arguments</option>
                  </select>
                </div>

                {scanProfile === 'custom' && (
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">
                      Custom Arguments <span className="text-msf-red">*</span>
                    </label>
                    <input
                      type="text"
                      value={customArgs}
                      onChange={(e) => setCustomArgs(e.target.value)}
                      placeholder="-sV -sC -T4"
                      className="input w-full font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="importResults"
                    checked={importResults}
                    onChange={(e) => setImportResults(e.target.checked)}
                    className="rounded border-gray-600"
                  />
                  <label htmlFor="importResults" className="text-sm text-gray-300">
                    Automatically import discovered hosts to targets
                  </label>
                </div>

                <button
                  onClick={handleStartScan}
                  disabled={!scanTarget || scanning || (scanProfile === 'custom' && !customArgs)}
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting Scan...
                    </>
                  ) : (
                    <>
                      <Radar className="w-4 h-4" />
                      Start Scan
                    </>
                  )}
                </button>
              </div>

              {/* Scan History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-white">Scan History</h3>
                  <button
                    onClick={loadScans}
                    className="text-xs text-msf-blue hover:text-msf-blue/80"
                  >
                    Refresh
                  </button>
                </div>

                {scans.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Radar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No scan history</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {scans.map((scan) => (
                      <div
                        key={scan.id}
                        className="bg-msf-darker rounded-lg p-3 border border-msf-border"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {scan.status === 'running' || scan.status === 'pending' ? (
                                <Loader2 className="w-4 h-4 text-msf-blue animate-spin flex-shrink-0" />
                              ) : scan.status === 'completed' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                              ) : (
                                <XOctagon className="w-4 h-4 text-msf-red flex-shrink-0" />
                              )}
                              <span className="text-white font-mono text-sm truncate">
                                {scan.targets}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span className="capitalize">{scan.profile}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(scan.created_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {scan.status === 'completed' && scan.results && (
                              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                                {scan.results.hosts_up} hosts found
                              </span>
                            )}
                            {scan.imported !== undefined && scan.imported > 0 && (
                              <span className="text-xs px-2 py-1 bg-msf-blue/20 text-msf-blue rounded">
                                {scan.imported} imported
                              </span>
                            )}
                          </div>
                        </div>
                        {scan.error && (
                          <p className="text-xs text-msf-red mt-2">{scan.error}</p>
                        )}
                        {scan.status === 'completed' && scan.results && scan.results.hosts.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-msf-border">
                            <p className="text-xs text-gray-400 mb-1">Discovered hosts:</p>
                            <div className="flex flex-wrap gap-1">
                              {scan.results.hosts.slice(0, 10).map((host, i) => (
                                <span
                                  key={i}
                                  className="text-xs px-2 py-0.5 bg-msf-card rounded font-mono text-gray-300"
                                >
                                  {host.ip}
                                  {host.services.length > 0 && (
                                    <span className="text-gray-500 ml-1">
                                      ({host.services.length} ports)
                                    </span>
                                  )}
                                </span>
                              ))}
                              {scan.results.hosts.length > 10 && (
                                <span className="text-xs text-gray-500">
                                  +{scan.results.hosts.length - 10} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

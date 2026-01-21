import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../services/api'
import { PayloadTemplate } from '../../types'
import {
  Shield,
  Download,
  FileCode,
  Settings,
  ChevronDown,
  ChevronRight,
  Loader2,
  Globe,
  Copy,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react'

interface PayloadFormat {
  id: string
  name: string
  extension: string
  platform?: string
}

interface FormatCategory {
  executable: PayloadFormat[]
  transform: PayloadFormat[]
  web: PayloadFormat[]
}

interface PayloadOption {
  type: string
  required: boolean
  description: string
  default: unknown
  advanced?: boolean
  evasion?: boolean
}

interface Encoder {
  name: string
  rank: string
  description: string
}

interface HostedPayload {
  id: string
  filename: string
  url: string
  url_path: string
  payload: string
  format: string
  size: number
  created: string
  expires: string
  downloads: number
}

export default function Payloads() {
  const [templates, setTemplates] = useState<PayloadTemplate[]>([])
  const [formats, setFormats] = useState<FormatCategory | null>(null)
  const [encoders, setEncoders] = useState<Encoder[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<PayloadTemplate | null>(null)
  const [customPayload, setCustomPayload] = useState('')
  const [selectedFormat, setSelectedFormat] = useState('exe')
  const [options, setOptions] = useState<Record<string, string>>({ LHOST: '', LPORT: '4444' })
  const [payloadOptions, setPayloadOptions] = useState<Record<string, PayloadOption>>({})
  const [generating, setGenerating] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('executable')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)

  // Encoder settings
  const [selectedEncoder, setSelectedEncoder] = useState('')
  const [iterations, setIterations] = useState(1)
  const [badChars, setBadChars] = useState('')

  // Hosting
  const [showHosting, setShowHosting] = useState(false)
  const [hostedPayloads, setHostedPayloads] = useState<HostedPayload[]>([])
  const [hostFilename, setHostFilename] = useState('')
  const [hostUrlPath, setHostUrlPath] = useState('')
  const [hostIp, setHostIp] = useState('')
  const [hostPort, setHostPort] = useState('8000')
  const [hostExpireHours, setHostExpireHours] = useState(24)
  const [hosting, setHosting] = useState(false)

  // Platform filter
  const [platformFilter, setPlatformFilter] = useState<string>('all')

  // Ref for debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Load initial data with error handling
    api.getPayloadTemplates()
      .then((data) => setTemplates(data.templates || []))
      .catch((e) => console.error('Failed to load templates:', e))

    api.getPayloadFormats()
      .then(setFormats)
      .catch((e) => console.error('Failed to load formats:', e))

    api.getPayloadEncoders()
      .then((data) => {
        // Handle both string array and object array from API
        const encoderList = (data.encoders || []).map((enc: unknown) => {
          if (typeof enc === 'string') {
            return { name: enc, rank: 'normal', description: '' }
          }
          // Already an object - safely extract properties
          const encObj = enc as Record<string, unknown>
          return {
            name: String(encObj.name || ''),
            rank: String(encObj.rank || 'normal'),
            description: String(encObj.description || ''),
          }
        })
        setEncoders(encoderList)
      })
      .catch((e) => console.error('Failed to load encoders:', e))

    loadHostedPayloads()

    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const loadHostedPayloads = async () => {
    try {
      const data = await api.getHostedPayloads()
      setHostedPayloads(data.payloads || [])
    } catch (e) {
      console.error('Failed to load hosted payloads:', e)
    }
  }

  const fetchPayloadOptions = useCallback(async (payloadName: string) => {
    if (!payloadName) return

    setLoadingOptions(true)
    try {
      const data = await api.getPayloadOptions(payloadName)
      setPayloadOptions(data.options || {})

      // Set default values for options using functional update to avoid stale closure
      setOptions((prevOptions) => {
        const newOptions: Record<string, string> = { ...prevOptions }
        Object.entries(data.options || {}).forEach(([key, opt]) => {
          const option = opt as PayloadOption
          if (option.default !== null && option.default !== undefined && !newOptions[key]) {
            newOptions[key] = String(option.default)
          }
        })
        return newOptions
      })
    } catch (e) {
      console.error('Failed to fetch payload options:', e)
      setPayloadOptions({})
    } finally {
      setLoadingOptions(false)
    }
  }, [])

  const handleTemplateSelect = (template: PayloadTemplate) => {
    setSelectedTemplate(template)
    setCustomPayload(template.payload)
    setSelectedFormat(template.format)
    setOptions({
      LHOST: options.LHOST || '',
      LPORT: String(template.options?.LPORT || 4444),
    })
    fetchPayloadOptions(template.payload)
  }

  const handlePayloadChange = (payload: string) => {
    setCustomPayload(payload)

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    if (payload && payload.includes('/')) {
      // Debounce the fetch
      debounceTimerRef.current = setTimeout(() => {
        fetchPayloadOptions(payload)
      }, 500)
    }
  }

  const handleGenerate = async () => {
    const payload = customPayload || selectedTemplate?.payload
    if (!payload) return

    setGenerating(true)
    try {
      const blob = await api.generatePayload(
        payload,
        selectedFormat,
        options,
        selectedEncoder || undefined,
        iterations,
        badChars || undefined
      )

      // Download the file
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Get proper extension
      const ext = formats?.executable.find(f => f.id === selectedFormat)?.extension ||
                  formats?.transform.find(f => f.id === selectedFormat)?.extension ||
                  formats?.web.find(f => f.id === selectedFormat)?.extension || ''
      a.download = `payload${ext}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to generate payload:', error)
      alert('Failed to generate payload. Check console for details.')
    } finally {
      setGenerating(false)
    }
  }

  const handleHost = async () => {
    const payload = customPayload || selectedTemplate?.payload
    if (!payload) return

    setHosting(true)
    try {
      await api.hostPayload(
        payload,
        selectedFormat,
        options,
        hostFilename || undefined,
        hostExpireHours,
        selectedEncoder || undefined,
        hostUrlPath || undefined
      )
      await loadHostedPayloads()
      setHostFilename('')
      setHostUrlPath('')
    } catch (error) {
      console.error('Failed to host payload:', error)
      alert('Failed to host payload. Check console for details.')
    } finally {
      setHosting(false)
    }
  }

  const handleDeleteHosted = async (id: string) => {
    try {
      await api.deleteHostedPayload(id)
      await loadHostedPayloads()
    } catch (e) {
      console.error('Failed to delete hosted payload:', e)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const filteredTemplates = platformFilter === 'all'
    ? templates
    : templates.filter(t => t.platform === platformFilter)

  const basicOptions = ['LHOST', 'LPORT']
  const advancedOptions = Object.entries(payloadOptions).filter(
    ([key]) => !basicOptions.includes(key)
  )

  const renderFormats = (category: string, formatList: PayloadFormat[]) => (
    <div className="border border-msf-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
        className="w-full flex items-center justify-between p-3 bg-msf-darker hover:bg-msf-card transition-colors"
      >
        <span className="text-sm font-medium text-white capitalize">{category}</span>
        {expandedCategory === category ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {expandedCategory === category && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3">
          {formatList.map((format) => (
            <button
              key={format.id}
              onClick={() => setSelectedFormat(format.id)}
              className={`p-2 rounded text-left transition-colors ${
                selectedFormat === format.id
                  ? 'bg-msf-blue/20 border border-msf-blue'
                  : 'bg-msf-card border border-msf-border hover:border-gray-500'
              }`}
            >
              <p className="text-sm text-white">{format.name}</p>
              <p className="text-xs text-gray-400">{format.extension || 'no ext'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payload Generator</h1>
          <p className="text-gray-400 mt-1">Generate payloads in various formats</p>
        </div>
        <button
          onClick={() => setShowHosting(!showHosting)}
          className={`btn ${showHosting ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
        >
          <Globe className="w-4 h-4" />
          {showHosting ? 'Hide Hosting' : 'Payload Hosting'}
          {hostedPayloads.length > 0 && (
            <span className="bg-msf-accent text-black text-xs px-1.5 py-0.5 rounded-full">
              {hostedPayloads.length}
            </span>
          )}
        </button>
      </div>

      {/* Hosted Payloads Panel */}
      {showHosting && (
        <div className="bg-msf-card border border-msf-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-msf-accent" />
              Hosted Payloads
            </h2>
            <button onClick={loadHostedPayloads} className="text-gray-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {hostedPayloads.length === 0 ? (
            <p className="text-gray-400 text-sm">No hosted payloads. Generate and host a payload below.</p>
          ) : (
            <div className="space-y-2">
              {hostedPayloads.map((hp) => {
                const fullUrl = `http://${hostIp || options.LHOST || window.location.hostname}:${hostPort}${hp.url}`
                return (
                  <div
                    key={hp.id}
                    className="p-3 bg-msf-darker rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{hp.filename}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{hp.payload}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleDeleteHosted(hp.id)}
                          className="p-2 text-gray-400 hover:text-msf-red"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 text-xs bg-msf-card text-msf-accent px-2 py-1 rounded font-mono truncate">
                        {fullUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(fullUrl)}
                        className="p-1.5 text-gray-400 hover:text-white bg-msf-card rounded"
                        title="Copy URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {hp.downloads} downloads · Expires: {new Date(hp.expires).toLocaleString()}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates */}
        <div className="bg-msf-card border border-msf-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Templates</h2>

          {/* Platform Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', 'windows', 'linux', 'android', 'macos', 'multi'].map((platform) => (
              <button
                key={platform}
                onClick={() => setPlatformFilter(platform)}
                className={`px-3 py-1 text-xs rounded-full capitalize ${
                  platformFilter === platform
                    ? 'bg-msf-accent text-black'
                    : 'bg-msf-darker text-gray-300 hover:bg-msf-border'
                }`}
              >
                {platform}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredTemplates.map((template, i) => (
              <button
                key={i}
                onClick={() => handleTemplateSelect(template)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedTemplate?.name === template.name
                    ? 'bg-msf-purple/20 border border-msf-purple'
                    : 'bg-msf-darker hover:bg-msf-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white font-medium">{template.name}</p>
                  <span className="text-xs bg-msf-border px-2 py-0.5 rounded text-gray-300">
                    {template.platform}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mt-1 truncate">{template.payload}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payload Selection */}
          <div className="bg-msf-card border border-msf-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-msf-purple" />
              Payload Configuration
              {loadingOptions && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Payload</label>
                <input
                  type="text"
                  value={customPayload}
                  onChange={(e) => handlePayloadChange(e.target.value)}
                  placeholder="windows/x64/meterpreter/reverse_tcp"
                  className="input font-mono"
                />
              </div>

              {/* Basic Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    LHOST
                    {payloadOptions.LHOST?.required && <span className="text-msf-red ml-1">*</span>}
                  </label>
                  <input
                    type="text"
                    value={options.LHOST || ''}
                    onChange={(e) => setOptions({ ...options, LHOST: e.target.value })}
                    placeholder="Your IP address"
                    className="input"
                  />
                  {payloadOptions.LHOST?.description && (
                    <p className="text-xs text-gray-500 mt-1">{payloadOptions.LHOST.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    LPORT
                    {payloadOptions.LPORT?.required && <span className="text-msf-red ml-1">*</span>}
                  </label>
                  <input
                    type="number"
                    value={options.LPORT || ''}
                    onChange={(e) => setOptions({ ...options, LPORT: e.target.value })}
                    placeholder="4444"
                    className="input"
                  />
                </div>
              </div>

              {/* Advanced Options Toggle */}
              {advancedOptions.length > 0 && (
                <div className="border-t border-msf-border pt-4">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-msf-blue hover:text-msf-blue/80"
                  >
                    {showAdvanced ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options ({advancedOptions.length})
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto">
                      {advancedOptions.map(([key, opt]) => (
                        <div key={key} className="grid grid-cols-3 gap-2 items-start">
                          <label className="text-sm text-gray-300 pt-2 flex items-center gap-1">
                            {key}
                            {opt.required && <span className="text-msf-red">*</span>}
                            {opt.advanced && (
                              <span className="text-xs bg-msf-darker px-1 rounded">adv</span>
                            )}
                          </label>
                          <div className="col-span-2">
                            <input
                              type="text"
                              value={options[key] || ''}
                              onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                              placeholder={opt.default !== null ? String(opt.default) : ''}
                              className="input text-sm"
                            />
                            {opt.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{opt.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Encoder Settings */}
          <div className="bg-msf-card border border-msf-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-msf-yellow" />
              Encoding & Obfuscation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Encoder</label>
                <select
                  value={selectedEncoder}
                  onChange={(e) => setSelectedEncoder(e.target.value)}
                  className="input"
                >
                  <option value="">None</option>
                  {encoders.map((enc, index) => (
                    <option key={`${enc.name}-${index}`} value={enc.name}>
                      {enc.name} ({enc.rank})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Iterations</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={iterations}
                  onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
                  className="input"
                  disabled={!selectedEncoder}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Bad Chars (hex)</label>
                <input
                  type="text"
                  value={badChars}
                  onChange={(e) => setBadChars(e.target.value)}
                  placeholder="\x00\x0a\x0d"
                  className="input font-mono"
                />
              </div>
            </div>
          </div>

          {/* Output Format */}
          <div className="bg-msf-card border border-msf-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileCode className="w-5 h-5 text-msf-blue" />
              Output Format
            </h2>
            {formats && (
              <div className="space-y-3">
                {renderFormats('executable', formats.executable)}
                {renderFormats('transform', formats.transform)}
                {renderFormats('web', formats.web)}
              </div>
            )}
          </div>

          {/* Hosting Options */}
          {showHosting && (
            <div className="bg-msf-card border border-msf-border rounded-lg p-5">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-msf-accent" />
                Hosting Options
              </h2>
              <div className="space-y-4">
                {/* Host Address */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-300 mb-2">Host IP/Address</label>
                    <input
                      type="text"
                      value={hostIp || options.LHOST || ''}
                      onChange={(e) => setHostIp(e.target.value)}
                      placeholder={options.LHOST || '0.0.0.0'}
                      className="input"
                    />
                    <p className="text-xs text-gray-500 mt-1">IP address victims will connect to</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Port</label>
                    <input
                      type="text"
                      value={hostPort}
                      onChange={(e) => setHostPort(e.target.value)}
                      placeholder="8000"
                      className="input"
                    />
                  </div>
                </div>

                {/* URL Path and Filename */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">URL Path</label>
                    <input
                      type="text"
                      value={hostUrlPath}
                      onChange={(e) => setHostUrlPath(e.target.value)}
                      placeholder={`/${hostFilename || 'update.exe'}`}
                      className="input font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Custom path like /downloadandroid</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Download Filename</label>
                    <input
                      type="text"
                      value={hostFilename}
                      onChange={(e) => setHostFilename(e.target.value)}
                      placeholder="update.exe"
                      className="input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Filename when downloaded</p>
                  </div>
                </div>

                {/* Expiration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Expire After (hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={hostExpireHours}
                      onChange={(e) => setHostExpireHours(parseInt(e.target.value) || 24)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Preview URL</label>
                    <div className="input bg-msf-darker text-msf-accent font-mono text-sm overflow-x-auto">
                      http://{hostIp || options.LHOST || '<IP>'}:{hostPort}/dl{hostUrlPath || `/${hostFilename || 'update.exe'}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleGenerate}
              disabled={generating || (!customPayload && !selectedTemplate)}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-3"
            >
              {generating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              {generating ? 'Generating...' : 'Generate & Download'}
            </button>

            {showHosting && (
              <button
                onClick={handleHost}
                disabled={hosting || (!customPayload && !selectedTemplate)}
                className="btn btn-secondary flex-1 flex items-center justify-center gap-2 py-3"
              >
                {hosting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Globe className="w-5 h-5" />
                )}
                {hosting ? 'Hosting...' : 'Generate & Host'}
              </button>
            )}
          </div>

          {/* Info */}
          <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
            <p className="text-sm text-gray-400">
              <strong className="text-white">Note:</strong> Make sure your listener is running before
              executing the payload on the target. Use the Listeners page to create a handler with
              matching payload and port settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

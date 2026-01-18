import { useState, useEffect } from 'react'
import { Module, ModuleOption } from '../../types'
import { api } from '../../services/api'
import { X, Play, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'

interface ExecuteModuleModalProps {
  module: Module
  moduleType: string
  onClose: () => void
  onExecutionComplete?: (result: ExecutionResult) => void
}

interface ExecutionResult {
  job_id?: number
  uuid?: string
  status: string
  error?: string
}

type TabType = 'basic' | 'advanced' | 'evasion'
type ExecutionState = 'idle' | 'executing' | 'success' | 'error'

export default function ExecuteModuleModal({
  module,
  moduleType,
  onClose,
  onExecutionComplete,
}: ExecuteModuleModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('basic')
  const [moduleOptions, setModuleOptions] = useState<Record<string, string>>({})
  const [selectedPayload, setSelectedPayload] = useState<string>('')
  const [payloadOptions, setPayloadOptions] = useState<Record<string, string>>({})
  const [availablePayloads, setAvailablePayloads] = useState<string[]>([])
  const [loadingPayloads, setLoadingPayloads] = useState(false)
  const [executionState, setExecutionState] = useState<ExecutionState>('idle')
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [payloadSearch, setPayloadSearch] = useState('')

  // Initialize module options with defaults
  useEffect(() => {
    if (module.options) {
      const defaults: Record<string, string> = {}
      Object.entries(module.options).forEach(([name, opt]) => {
        if (opt.default !== null && opt.default !== undefined) {
          defaults[name] = String(opt.default)
        }
      })
      setModuleOptions(defaults)
    }
  }, [module])

  // Fetch compatible payloads for exploit modules
  useEffect(() => {
    if (moduleType === 'exploit' && module.name) {
      setLoadingPayloads(true)
      api
        .getCompatiblePayloads(moduleType, module.name)
        .then((response) => {
          setAvailablePayloads(response.payloads || [])
          // Auto-select first payload if available
          if (response.payloads?.length > 0) {
            setSelectedPayload(response.payloads[0])
          }
        })
        .catch((err) => {
          console.error('Failed to fetch payloads:', err)
        })
        .finally(() => {
          setLoadingPayloads(false)
        })
    }
  }, [moduleType, module.name])

  const categorizeOptions = (options: Record<string, ModuleOption>) => {
    const basic: [string, ModuleOption][] = []
    const advanced: [string, ModuleOption][] = []
    const evasion: [string, ModuleOption][] = []

    Object.entries(options).forEach(([name, opt]) => {
      if (opt.evasion) {
        evasion.push([name, opt])
      } else if (opt.advanced) {
        advanced.push([name, opt])
      } else {
        basic.push([name, opt])
      }
    })

    return { basic, advanced, evasion }
  }

  const handleExecute = async () => {
    setExecutionState('executing')
    setExecutionResult(null)

    try {
      const result = await api.executeModule(
        moduleType,
        module.name,
        moduleOptions,
        moduleType === 'exploit' ? selectedPayload : undefined,
        moduleType === 'exploit' ? payloadOptions : undefined
      )

      setExecutionResult(result)
      setExecutionState(result.status === 'launched' ? 'success' : 'error')
      onExecutionComplete?.(result)
    } catch (err: any) {
      const errorResult = {
        status: 'error',
        error: err.response?.data?.detail || err.message || 'Execution failed',
      }
      setExecutionResult(errorResult)
      setExecutionState('error')
      onExecutionComplete?.(errorResult)
    }
  }

  const handleOptionChange = (name: string, value: string) => {
    setModuleOptions((prev) => ({ ...prev, [name]: value }))
  }

  const handlePayloadOptionChange = (name: string, value: string) => {
    setPayloadOptions((prev) => ({ ...prev, [name]: value }))
  }

  const filteredPayloads = availablePayloads.filter((p) =>
    p.toLowerCase().includes(payloadSearch.toLowerCase())
  )

  const { basic, advanced, evasion } = module.options
    ? categorizeOptions(module.options)
    : { basic: [], advanced: [], evasion: [] }

  const renderOptionInput = (
    name: string,
    opt: ModuleOption,
    value: string,
    onChange: (name: string, value: string) => void
  ) => {
    return (
      <div key={name} className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <span className="font-mono">{name}</span>
          {opt.required && <span className="text-msf-red text-xs">*</span>}
        </label>
        {opt.type === 'bool' ? (
          <select
            value={value || 'false'}
            onChange={(e) => onChange(name, e.target.value)}
            className="input"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(name, e.target.value)}
            placeholder={opt.description}
            className="input"
          />
        )}
        <p className="text-xs text-gray-500">{opt.description}</p>
      </div>
    )
  }

  const renderOptions = (options: [string, ModuleOption][]) => {
    if (options.length === 0) {
      return <p className="text-gray-500 text-sm">No options in this category</p>
    }

    return (
      <div className="space-y-4">
        {options.map(([name, opt]) =>
          renderOptionInput(name, opt, moduleOptions[name] || '', handleOptionChange)
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-msf-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-semibold text-white">Execute Module</h3>
            <p className="text-sm text-gray-400 font-mono mt-1">{module.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-msf-border shrink-0">
          {(['basic', 'advanced', 'evasion'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-msf-blue border-b-2 border-msf-blue'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
              {tab === 'basic' && (
                <span className="ml-1 text-xs text-gray-500">({basic.length})</span>
              )}
              {tab === 'advanced' && (
                <span className="ml-1 text-xs text-gray-500">({advanced.length})</span>
              )}
              {tab === 'evasion' && (
                <span className="ml-1 text-xs text-gray-500">({evasion.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Payload Selection for Exploits */}
          {moduleType === 'exploit' && activeTab === 'basic' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <span className="font-semibold">Payload</span>
                <span className="text-msf-red text-xs">*</span>
              </label>
              {loadingPayloads ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading compatible payloads...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={payloadSearch}
                    onChange={(e) => setPayloadSearch(e.target.value)}
                    placeholder="Search payloads..."
                    className="input"
                  />
                  <div className="relative">
                    <select
                      value={selectedPayload}
                      onChange={(e) => setSelectedPayload(e.target.value)}
                      className="input appearance-none pr-10"
                      size={1}
                    >
                      <option value="">Select a payload...</option>
                      {filteredPayloads.map((payload) => (
                        <option key={payload} value={payload}>
                          {payload}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-500">
                    {availablePayloads.length} compatible payload(s) available
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Module Options */}
          {activeTab === 'basic' && renderOptions(basic)}
          {activeTab === 'advanced' && renderOptions(advanced)}
          {activeTab === 'evasion' && renderOptions(evasion)}

          {/* Payload Options (if payload selected) */}
          {moduleType === 'exploit' && selectedPayload && activeTab === 'basic' && (
            <div className="border-t border-msf-border pt-4 mt-4">
              <h4 className="text-sm font-semibold text-white mb-3">
                Payload Options ({selectedPayload.split('/').pop()})
              </h4>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="font-mono">LHOST</span>
                    <span className="text-msf-red text-xs">*</span>
                  </label>
                  <input
                    type="text"
                    value={payloadOptions['LHOST'] || ''}
                    onChange={(e) => handlePayloadOptionChange('LHOST', e.target.value)}
                    placeholder="Listening host (your IP)"
                    className="input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="font-mono">LPORT</span>
                    <span className="text-msf-red text-xs">*</span>
                  </label>
                  <input
                    type="text"
                    value={payloadOptions['LPORT'] || '4444'}
                    onChange={(e) => handlePayloadOptionChange('LPORT', e.target.value)}
                    placeholder="Listening port"
                    className="input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Execution Result */}
          {executionResult && (
            <div
              className={`p-4 rounded-lg border ${
                executionState === 'success'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                {executionState === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium ${
                      executionState === 'success' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {executionState === 'success' ? 'Module Launched' : 'Execution Failed'}
                  </p>
                  {executionResult.job_id !== undefined && (
                    <p className="text-sm text-gray-400 mt-1">
                      Job ID: <span className="font-mono">{executionResult.job_id}</span>
                    </p>
                  )}
                  {executionResult.uuid && (
                    <p className="text-sm text-gray-400">
                      UUID: <span className="font-mono text-xs">{executionResult.uuid}</span>
                    </p>
                  )}
                  {executionResult.error && (
                    <p className="text-sm text-red-400 mt-1">{executionResult.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-msf-border flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="btn btn-secondary">
            {executionState === 'success' ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleExecute}
            disabled={executionState === 'executing'}
            className="btn btn-primary flex items-center gap-2"
          >
            {executionState === 'executing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Execute
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useModuleStore } from '../../store/moduleStore'
import ExecuteModuleModal from './ExecuteModuleModal'
import {
  Search,
  Box,
  Shield,
  Zap,
  Target,
  Code,
  Hash,
  ChevronLeft,
  ChevronRight,
  Play,
  Info,
  X,
} from 'lucide-react'

const moduleTypes = [
  { id: 'exploit', name: 'Exploits', icon: Target, color: 'text-msf-red' },
  { id: 'payload', name: 'Payloads', icon: Shield, color: 'text-msf-purple' },
  { id: 'auxiliary', name: 'Auxiliary', icon: Zap, color: 'text-msf-yellow' },
  { id: 'post', name: 'Post', icon: Box, color: 'text-msf-accent' },
  { id: 'encoder', name: 'Encoders', icon: Code, color: 'text-msf-blue' },
  { id: 'nop', name: 'NOPs', icon: Hash, color: 'text-gray-400' },
]

export default function Modules() {
  const {
    modules,
    selectedModule,
    selectedType,
    searchQuery,
    total,
    offset,
    isLoading,
    fetchModules,
    selectModule,
    clearSelection,
    setSearchQuery,
  } = useModuleStore()

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [showExecuteModal, setShowExecuteModal] = useState(false)
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    status: string
    job_id?: number
    module?: string
  } | null>(null)

  useEffect(() => {
    fetchModules(selectedType, 0, searchQuery)
  }, [selectedType])

  const handleSearch = () => {
    setSearchQuery(localSearch)
    fetchModules(selectedType, 0, localSearch)
  }

  const handlePageChange = (newOffset: number) => {
    fetchModules(selectedType, newOffset, searchQuery)
  }

  const handleModuleClick = (moduleName: string) => {
    selectModule(selectedType, moduleName)
  }

  const canExecuteModule = (type: string) => {
    return ['exploit', 'auxiliary', 'post'].includes(type)
  }

  const getRunButtonLabel = (type: string) => {
    switch (type) {
      case 'exploit':
        return 'Run Exploit'
      case 'auxiliary':
        return 'Run Auxiliary'
      case 'post':
        return 'Run Post'
      default:
        return 'Run'
    }
  }

  const currentPage = Math.floor(offset / 100) + 1
  const totalPages = Math.ceil(total / 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Modules</h1>
        <p className="text-gray-400 mt-1">Browse and execute Metasploit modules</p>
      </div>

      {/* Module Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {moduleTypes.map((type) => {
          const Icon = type.icon
          const isActive = selectedType === type.id
          return (
            <button
              key={type.id}
              onClick={() => fetchModules(type.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-msf-card border border-msf-blue text-white'
                  : 'bg-msf-darker border border-msf-border text-gray-400 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? type.color : ''}`} />
              <span>{type.name}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search modules..."
            className="input pl-10"
          />
        </div>
        <button onClick={handleSearch} className="btn btn-primary">
          Search
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module List */}
        <div className="lg:col-span-2 bg-msf-card border border-msf-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-msf-border flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Showing {offset + 1}-{Math.min(offset + 100, total)} of {total} modules
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(Math.max(0, offset - 100))}
                disabled={offset === 0}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(offset + 100)}
                disabled={offset + 100 >= total}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Loading modules...</div>
            ) : modules.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No modules found</div>
            ) : (
              <div className="divide-y divide-msf-border">
                {modules.map((moduleName) => (
                  <button
                    key={moduleName}
                    onClick={() => handleModuleClick(moduleName)}
                    className={`w-full px-4 py-3 text-left hover:bg-msf-darker transition-colors ${
                      selectedModule?.name === moduleName ? 'bg-msf-darker' : ''
                    }`}
                  >
                    <p className="text-sm text-white font-mono truncate">{moduleName}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Module Details */}
        <div className="bg-msf-card border border-msf-border rounded-lg overflow-hidden">
          {selectedModule ? (
            <>
              <div className="p-4 border-b border-msf-border flex items-center justify-between">
                <h3 className="font-semibold text-white">Module Details</h3>
                <button onClick={clearSelection} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Name</p>
                  <p className="text-sm text-white">{selectedModule.name}</p>
                </div>
                {selectedModule.description && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Description</p>
                    <p className="text-sm text-gray-300">{selectedModule.description}</p>
                  </div>
                )}
                {selectedModule.authors && selectedModule.authors.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Authors</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedModule.authors.map((author, i) => (
                        <span key={i} className="text-xs bg-msf-darker px-2 py-1 rounded text-gray-300">
                          {author}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedModule.options && Object.keys(selectedModule.options).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Options</p>
                    <div className="space-y-2">
                      {Object.entries(selectedModule.options).slice(0, 10).map(([name, opt]) => (
                        <div key={name} className="p-2 bg-msf-darker rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-mono">{name}</span>
                            {opt.required && (
                              <span className="text-xs text-msf-red">required</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{opt.description}</p>
                          {opt.default && (
                            <p className="text-xs text-gray-500 mt-1">
                              Default: {String(opt.default)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {canExecuteModule(selectedType) && (
                  <button
                    onClick={() => setShowExecuteModal(true)}
                    className="btn btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    {getRunButtonLabel(selectedType)}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a module to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Execution Result Notification */}
      {lastExecutionResult && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg border shadow-lg z-40 ${
            lastExecutionResult.status === 'launched'
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className={`font-medium ${
                  lastExecutionResult.status === 'launched' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {lastExecutionResult.status === 'launched'
                  ? 'Module Launched Successfully'
                  : 'Module Execution Failed'}
              </p>
              {lastExecutionResult.job_id !== undefined && (
                <p className="text-sm text-gray-400">Job ID: {lastExecutionResult.job_id}</p>
              )}
              {lastExecutionResult.module && (
                <p className="text-xs text-gray-500 font-mono">{lastExecutionResult.module}</p>
              )}
            </div>
            <button
              onClick={() => setLastExecutionResult(null)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Execute Module Modal */}
      {showExecuteModal && selectedModule && (
        <ExecuteModuleModal
          module={selectedModule}
          moduleType={selectedType}
          onClose={() => setShowExecuteModal(false)}
          onExecutionComplete={(result) => {
            setLastExecutionResult({
              status: result.status,
              job_id: result.job_id,
              module: selectedModule.name,
            })
            // Auto-dismiss notification after 5 seconds
            setTimeout(() => setLastExecutionResult(null), 5000)
          }}
        />
      )}
    </div>
  )
}

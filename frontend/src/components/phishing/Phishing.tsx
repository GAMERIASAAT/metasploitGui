import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { notify } from '../../hooks/useNotifications'
import {
  PhishingCampaign,
  EmailTemplate,
  TargetGroup,
  LandingPage,
  CapturedCredential,
  SMTPConfig,
  CampaignStats,
  PhishingTarget,
  BitMTarget,
  BitMTemplate,
  BitMSession,
  CapturedBitMData,
  BitMStats,
} from '../../types'
import {
  Mail,
  Users,
  Globe,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  Settings,
  FileText,
  Target,
  X,
  CheckCircle,
  XCircle,
  Send,
  MousePointer,
  Key,
  BarChart3,
  Copy,
  Upload,
  Loader2,
  ChevronDown,
  ChevronRight,
  Monitor,
  Zap,
  Cookie,
  ArrowRight,
  Server,
  Download,
  Square,
} from 'lucide-react'

type TabType = 'campaigns' | 'templates' | 'landing' | 'targets' | 'captured' | 'bitm' | 'settings'

const STATUS_COLORS = {
  draft: 'bg-gray-500/20 text-gray-400',
  scheduled: 'bg-blue-500/20 text-blue-400',
  running: 'bg-yellow-500/20 text-yellow-400',
  paused: 'bg-orange-500/20 text-orange-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
}

export default function Phishing() {
  const [activeTab, setActiveTab] = useState<TabType>('campaigns')
  const [isLoading, setIsLoading] = useState(false)

  // Data states
  const [campaigns, setCampaigns] = useState<PhishingCampaign[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [prebuiltTemplates, setPrebuiltTemplates] = useState<EmailTemplate[]>([])
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([])
  const [landingPages, setLandingPages] = useState<LandingPage[]>([])
  const [prebuiltPages, setPrebuiltPages] = useState<LandingPage[]>([])
  const [capturedCreds, setCapturedCreds] = useState<CapturedCredential[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SMTPConfig[]>([])

  // BitM states
  const [bitmTargets, setBitmTargets] = useState<BitMTarget[]>([])
  const [bitmTemplates, setBitmTemplates] = useState<BitMTemplate[]>([])
  const [bitmSessions, setBitmSessions] = useState<BitMSession[]>([])
  const [bitmCaptures, setBitmCaptures] = useState<CapturedBitMData[]>([])
  const [bitmStats, setBitmStats] = useState<BitMStats | null>(null)

  // Modal states
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [showLandingModal, setShowLandingModal] = useState(false)
  const [showSMTPModal, setShowSMTPModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [campaignStats, setCampaignStats] = useState<CampaignStats | null>(null)

  // BitM modal states
  const [showBitMTargetModal, setShowBitMTargetModal] = useState(false)
  const [showBitMSessionModal, setShowBitMSessionModal] = useState(false)
  const [showBitMCaptureModal, setShowBitMCaptureModal] = useState(false)
  const [selectedBitMCapture, setSelectedBitMCapture] = useState<CapturedBitMData | null>(null)
  const [bitmSessionResult, setBitmSessionResult] = useState<{ session: BitMSession | null; instructions: string[]; technical_notes: string[] } | null>(null)

  // Preview states
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)
  const [previewLandingPage, setPreviewLandingPage] = useState<LandingPage | null>(null)

  // Fetch data
  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await api.getPhishingCampaigns()
      setCampaigns(data.campaigns)
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const [custom, prebuilt] = await Promise.all([
        api.getEmailTemplates(),
        api.getPrebuiltTemplates(),
      ])
      console.log('Templates loaded:', { custom, prebuilt })
      setTemplates(custom.templates || [])
      setPrebuiltTemplates(prebuilt.templates || [])
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      notify.error('Error', 'Failed to load email templates')
    }
  }, [])

  const fetchTargetGroups = useCallback(async () => {
    try {
      const data = await api.getTargetGroups()
      setTargetGroups(data.groups)
    } catch (error) {
      console.error('Failed to fetch target groups:', error)
    }
  }, [])

  const fetchLandingPages = useCallback(async () => {
    try {
      const [custom, prebuilt] = await Promise.all([
        api.getLandingPages(),
        api.getPrebuiltLandingPages(),
      ])
      console.log('Landing pages loaded:', { custom, prebuilt })
      setLandingPages(custom.pages || [])
      setPrebuiltPages(prebuilt.pages || [])
    } catch (error) {
      console.error('Failed to fetch landing pages:', error)
      notify.error('Error', 'Failed to load landing pages')
    }
  }, [])

  const fetchCapturedCreds = useCallback(async () => {
    try {
      const data = await api.getCapturedCredentials()
      setCapturedCreds(data.credentials)
    } catch (error) {
      console.error('Failed to fetch captured credentials:', error)
    }
  }, [])

  const fetchSMTPConfigs = useCallback(async () => {
    try {
      const data = await api.getSMTPConfigs()
      setSmtpConfigs(data.configs)
    } catch (error) {
      console.error('Failed to fetch SMTP configs:', error)
    }
  }, [])

  // BitM fetch functions
  const fetchBitMData = useCallback(async () => {
    try {
      const [targetsData, templatesData, sessionsData, capturesData, statsData] = await Promise.all([
        api.getBitMTargets(),
        api.getBitMTemplates(),
        api.getBitMSessions(),
        api.getBitMCaptures(),
        api.getBitMStats(),
      ])
      setBitmTargets(targetsData.targets)
      setBitmTemplates(templatesData.templates)
      setBitmSessions(sessionsData.sessions)
      setBitmCaptures(capturesData.captures)
      setBitmStats(statsData)
    } catch (error) {
      console.error('Failed to fetch BitM data:', error)
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    Promise.all([
      fetchCampaigns(),
      fetchTemplates(),
      fetchTargetGroups(),
      fetchLandingPages(),
      fetchCapturedCreds(),
      fetchSMTPConfigs(),
      fetchBitMData(),
    ]).finally(() => setIsLoading(false))
  }, [fetchCampaigns, fetchTemplates, fetchTargetGroups, fetchLandingPages, fetchCapturedCreds, fetchSMTPConfigs, fetchBitMData])

  // Actions
  const launchCampaign = async (campaign: PhishingCampaign) => {
    if (!campaign.id) return
    try {
      const baseUrl = window.location.origin
      await api.launchCampaign(campaign.id, baseUrl)
      notify.success('Campaign Launched', `${campaign.name} is now sending emails`)
      fetchCampaigns()
    } catch (error) {
      notify.error('Launch Failed', 'Failed to launch campaign')
    }
  }

  const pauseCampaign = async (campaign: PhishingCampaign) => {
    if (!campaign.id) return
    try {
      await api.pauseCampaign(campaign.id)
      notify.info('Campaign Paused', `${campaign.name} has been paused`)
      fetchCampaigns()
    } catch (error) {
      notify.error('Pause Failed', 'Failed to pause campaign')
    }
  }

  const deleteCampaign = async (campaign: PhishingCampaign) => {
    if (!campaign.id || !confirm(`Delete campaign "${campaign.name}"?`)) return
    try {
      await api.deleteCampaign(campaign.id)
      fetchCampaigns()
    } catch (error) {
      notify.error('Delete Failed', 'Failed to delete campaign')
    }
  }

  const viewCampaignStats = async (campaign: PhishingCampaign) => {
    if (!campaign.id) return
    try {
      const stats = await api.getCampaignStats(campaign.id)
      setCampaignStats(stats)
      setShowStatsModal(true)
    } catch (error) {
      notify.error('Error', 'Failed to load campaign stats')
    }
  }

  const tabs = [
    { id: 'campaigns' as TabType, label: 'Campaigns', icon: Mail, count: campaigns.length },
    { id: 'templates' as TabType, label: 'Templates', icon: FileText, count: templates.length + prebuiltTemplates.length },
    { id: 'landing' as TabType, label: 'Landing Pages', icon: Globe, count: landingPages.length + prebuiltPages.length },
    { id: 'targets' as TabType, label: 'Targets', icon: Target, count: targetGroups.length },
    { id: 'captured' as TabType, label: 'Captured', icon: Key, count: capturedCreds.length },
    { id: 'bitm' as TabType, label: 'BitM Attack', icon: Monitor, count: bitmSessions.filter(s => s.status === 'active').length },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Phishing Campaigns</h1>
          <p className="text-gray-400 mt-1">Social engineering and credential harvesting</p>
        </div>
        <button
          onClick={() => {
            fetchCampaigns()
            fetchCapturedCreds()
          }}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-msf-border pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-msf-card text-white border-b-2 border-msf-accent'
                  : 'text-gray-400 hover:text-white hover:bg-msf-card/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.5 text-xs bg-msf-darker rounded">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-msf-card border border-msf-border rounded-lg">
        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Phishing Campaigns</h2>
              <button
                onClick={() => setShowCampaignModal(true)}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Campaign
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg font-medium text-white mb-2">No Campaigns</h3>
                <p className="text-gray-400 mb-4">Create your first phishing campaign</p>
                <button
                  onClick={() => setShowCampaignModal(true)}
                  className="btn btn-primary"
                >
                  Create Campaign
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="bg-msf-darker border border-msf-border rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-white">{campaign.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[campaign.status]}`}>
                            {campaign.status}
                          </span>
                        </div>
                        {campaign.description && (
                          <p className="text-sm text-gray-400 mb-3">{campaign.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Targets</p>
                            <p className="text-white font-medium">{campaign.total_targets}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Sent</p>
                            <p className="text-white font-medium flex items-center gap-1">
                              <Send className="w-3 h-3" />
                              {campaign.emails_sent}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Opened</p>
                            <p className="text-green-400 font-medium flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {campaign.emails_opened}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Clicked</p>
                            <p className="text-yellow-400 font-medium flex items-center gap-1">
                              <MousePointer className="w-3 h-3" />
                              {campaign.links_clicked}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Captured</p>
                            <p className="text-msf-red font-medium flex items-center gap-1">
                              <Key className="w-3 h-3" />
                              {campaign.credentials_captured}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => viewCampaignStats(campaign)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-msf-dark rounded transition-colors"
                          title="View Stats"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        {campaign.status === 'draft' && (
                          <button
                            onClick={() => launchCampaign(campaign)}
                            className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors"
                            title="Launch"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'running' && (
                          <button
                            onClick={() => pauseCampaign(campaign)}
                            className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteCampaign(campaign)}
                          className="p-2 text-gray-400 hover:text-msf-red hover:bg-msf-red/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Email Templates</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchTemplates}
                  className="btn btn-secondary flex items-center gap-2"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => setShowTemplateModal(true)}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Template
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {/* Prebuilt Templates */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Prebuilt Templates ({prebuiltTemplates.length})</h3>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading templates...
                  </div>
                ) : prebuiltTemplates.length === 0 ? (
                  <p className="text-gray-500 text-sm">No prebuilt templates available</p>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {prebuiltTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-msf-darker border border-msf-border rounded-lg p-4 hover:border-msf-accent transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-white">{template.name}</h4>
                        <span className="px-2 py-0.5 text-xs bg-msf-purple/20 text-msf-purple rounded">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{template.subject}</p>
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="text-sm text-msf-blue hover:text-msf-blue/80"
                      >
                        Preview
                      </button>
                    </div>
                  ))}
                </div>
                )}
              </div>

              {/* Custom Templates */}
              {templates.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Templates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="bg-msf-darker border border-msf-border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-white">{template.name}</h4>
                          <button
                            onClick={async () => {
                              if (template.id && confirm('Delete this template?')) {
                                await api.deleteEmailTemplate(template.id)
                                fetchTemplates()
                              }
                            }}
                            className="text-gray-400 hover:text-msf-red"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-400 line-clamp-2">{template.subject}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Landing Pages Tab */}
        {activeTab === 'landing' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Landing Pages</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLandingPages}
                  className="btn btn-secondary flex items-center gap-2"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={() => setShowLandingModal(true)}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Page
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {/* Prebuilt Pages */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Prebuilt Pages ({prebuiltPages.length})</h3>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading landing pages...
                  </div>
                ) : prebuiltPages.length === 0 ? (
                  <p className="text-gray-500 text-sm">No prebuilt landing pages available</p>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {prebuiltPages.map((page) => (
                    <div
                      key={page.id}
                      className="bg-msf-darker border border-msf-border rounded-lg p-4 hover:border-msf-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Globe className="w-5 h-5 text-msf-blue" />
                        <h4 className="font-medium text-white">{page.name}</h4>
                      </div>
                      <p className="text-sm text-gray-400 mb-3">
                        Captures: {page.capture_fields?.join(', ')}
                      </p>
                      <button
                        onClick={() => setPreviewLandingPage(page)}
                        className="text-sm text-msf-blue hover:text-msf-blue/80"
                      >
                        Preview
                      </button>
                    </div>
                  ))}
                </div>
                )}
              </div>

              {/* Custom Pages */}
              {landingPages.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Custom Pages</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {landingPages.map((page) => (
                      <div
                        key={page.id}
                        className="bg-msf-darker border border-msf-border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Globe className="w-5 h-5 text-gray-400" />
                            <h4 className="font-medium text-white">{page.name}</h4>
                          </div>
                          <button
                            onClick={async () => {
                              if (page.id && confirm('Delete this page?')) {
                                await api.deleteLandingPage(page.id)
                                fetchLandingPages()
                              }
                            }}
                            className="text-gray-400 hover:text-msf-red"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {page.cloned_from && (
                          <p className="text-xs text-gray-500 mb-2">Cloned from: {page.cloned_from}</p>
                        )}
                        <button
                          onClick={() => setPreviewLandingPage(page)}
                          className="text-sm text-msf-blue hover:text-msf-blue/80"
                        >
                          Preview
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Targets Tab */}
        {activeTab === 'targets' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Target Groups</h2>
              <button
                onClick={() => setShowTargetModal(true)}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Group
              </button>
            </div>

            {targetGroups.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg font-medium text-white mb-2">No Target Groups</h3>
                <p className="text-gray-400 mb-4">Create a group and add targets</p>
                <button
                  onClick={() => setShowTargetModal(true)}
                  className="btn btn-primary"
                >
                  Create Group
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {targetGroups.map((group) => (
                  <TargetGroupCard
                    key={group.id}
                    group={group}
                    onDelete={async () => {
                      if (group.id && confirm(`Delete group "${group.name}"?`)) {
                        await api.deleteTargetGroup(group.id)
                        fetchTargetGroups()
                      }
                    }}
                    onImport={async (csv) => {
                      if (group.id) {
                        const result = await api.importTargetsCSV(group.id, csv)
                        notify.success('Import Complete', `Imported ${result.imported} targets`)
                        fetchTargetGroups()
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Captured Credentials Tab */}
        {activeTab === 'captured' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">Captured Credentials</h2>
              <span className="text-gray-400">{capturedCreds.length} credentials</span>
            </div>

            {capturedCreds.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg font-medium text-white mb-2">No Captured Credentials</h3>
                <p className="text-gray-400">Credentials will appear here when targets submit them</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-msf-border">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Username</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Password</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">IP Address</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Captured At</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capturedCreds.map((cred) => (
                      <tr key={cred.id} className="border-b border-msf-border/50 hover:bg-msf-darker">
                        <td className="py-3 px-4 text-white font-mono">{cred.username || '-'}</td>
                        <td className="py-3 px-4">
                          <code className="bg-msf-dark px-2 py-1 rounded text-msf-red">
                            {cred.password || '-'}
                          </code>
                        </td>
                        <td className="py-3 px-4 text-gray-400">{cred.ip_address}</td>
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(cred.captured_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${cred.username}:${cred.password}`)
                              notify.info('Copied', 'Credentials copied to clipboard')
                            }}
                            className="text-gray-400 hover:text-white"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* BitM Attack Tab */}
        {activeTab === 'bitm' && (
          <div className="p-6 space-y-6">
            {/* BitM Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-msf-yellow" />
                  Browser-in-the-Middle Attack
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Use a real browser to proxy victim sessions - bypasses most anti-phishing protections
                </p>
              </div>
              <button
                onClick={fetchBitMData}
                className="btn btn-secondary flex items-center gap-2"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* BitM Stats */}
            {bitmStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-msf-blue/20 rounded-lg">
                      <Target className="w-5 h-5 text-msf-blue" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{bitmStats.total_targets}</p>
                      <p className="text-sm text-gray-400">Targets</p>
                    </div>
                  </div>
                </div>
                <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-msf-yellow/20 rounded-lg">
                      <Monitor className="w-5 h-5 text-msf-yellow" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{bitmStats.active_sessions}</p>
                      <p className="text-sm text-gray-400">Active Sessions</p>
                    </div>
                  </div>
                </div>
                <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-msf-green/20 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-msf-green" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{bitmStats.authenticated_sessions}</p>
                      <p className="text-sm text-gray-400">Authenticated</p>
                    </div>
                  </div>
                </div>
                <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-msf-purple/20 rounded-lg">
                      <Cookie className="w-5 h-5 text-msf-purple" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{bitmStats.captures_with_cookies}</p>
                      <p className="text-sm text-gray-400">Cookies Captured</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attack Flow Diagram */}
            <div className="bg-msf-darker border border-msf-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-4">How BitM Works</h3>
              <div className="flex items-center justify-center gap-4 text-sm">
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-msf-red/20 rounded-lg flex items-center justify-center mb-2">
                    <Globe className="w-7 h-7 text-msf-red" />
                  </div>
                  <span className="text-white">Victim</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500" />
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-msf-yellow/20 rounded-lg flex items-center justify-center mb-2">
                    <Monitor className="w-7 h-7 text-msf-yellow" />
                  </div>
                  <span className="text-white">Your Browser</span>
                  <span className="text-xs text-gray-500">(Headless)</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-500" />
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 bg-msf-green/20 rounded-lg flex items-center justify-center mb-2">
                    <Server className="w-7 h-7 text-msf-green" />
                  </div>
                  <span className="text-white">Real Site</span>
                  <span className="text-xs text-gray-500">(+ 2FA)</span>
                </div>
              </div>
              <p className="text-center text-xs text-gray-500 mt-4">
                The victim interacts with a real browser on your server via WebSocket. All session data is captured.
              </p>
            </div>

            {/* Target Templates */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Start Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bitmTemplates.filter(t => t.id !== 'custom').map((template) => (
                  <div
                    key={template.id}
                    className="bg-msf-darker border border-msf-border rounded-lg p-4 hover:border-msf-accent transition-colors cursor-pointer"
                    onClick={async () => {
                      if (template.id === 'custom') {
                        setShowBitMTargetModal(true)
                      } else {
                        try {
                          await api.createBitMTarget({
                            name: template.name,
                            target_url: template.target_url,
                            description: template.description,
                            browser_type: template.browser_type as 'chromium' | 'firefox' | 'webkit',
                            viewport_width: 1920,
                            viewport_height: 1080,
                            capture_screenshots: true,
                            capture_network: true,
                            capture_cookies: template.capture_cookies,
                            capture_storage: true,
                            auth_indicators: template.auth_indicators,
                          })
                          notify.success('Target Created', `${template.name} target added`)
                          fetchBitMData()
                        } catch (error) {
                          notify.error('Error', 'Failed to create target')
                        }
                      }
                    }}
                  >
                    <h4 className="font-medium text-white mb-1">{template.name}</h4>
                    <p className="text-sm text-gray-400 mb-2">{template.description}</p>
                    <p className="text-xs text-gray-500">{template.target_url}</p>
                  </div>
                ))}
                <div
                  className="bg-msf-darker border border-dashed border-msf-border rounded-lg p-4 hover:border-msf-accent transition-colors cursor-pointer flex flex-col items-center justify-center"
                  onClick={() => setShowBitMTargetModal(true)}
                >
                  <Plus className="w-8 h-8 text-gray-500 mb-2" />
                  <span className="text-gray-400">Custom Target</span>
                </div>
              </div>
            </div>

            {/* Configured Targets */}
            {bitmTargets.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-medium text-gray-400">Your Targets</h3>
                  <button
                    onClick={() => setShowBitMTargetModal(true)}
                    className="btn btn-secondary text-sm flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Target
                  </button>
                </div>
                <div className="space-y-3">
                  {bitmTargets.map((target) => (
                    <div
                      key={target.id}
                      className="bg-msf-darker border border-msf-border rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-white">{target.name}</h4>
                          <p className="text-sm text-gray-400">{target.target_url}</p>
                          <div className="flex gap-2 mt-2">
                            <span className="px-2 py-0.5 text-xs bg-msf-dark text-gray-400 rounded">
                              {target.browser_type}
                            </span>
                            <span className="px-2 py-0.5 text-xs bg-msf-dark text-gray-400 rounded">
                              {target.sessions_count || 0} sessions
                            </span>
                            <span className="px-2 py-0.5 text-xs bg-msf-dark text-gray-400 rounded">
                              {target.captures_count || 0} captures
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const result = await api.startBitMSession(target.id!, 8443)
                                setBitmSessionResult(result)
                                setShowBitMSessionModal(true)
                                notify.success('Session Started', 'BitM session is active')
                                fetchBitMData()
                              } catch (error) {
                                notify.error('Error', 'Failed to start session')
                              }
                            }}
                            className="btn btn-primary flex items-center gap-2"
                          >
                            <Play className="w-4 h-4" />
                            Start Session
                          </button>
                          <button
                            onClick={async () => {
                              if (target.id && confirm(`Delete target "${target.name}"?`)) {
                                await api.deleteBitMTarget(target.id)
                                fetchBitMData()
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-msf-red"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Sessions */}
            {bitmSessions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Active Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-msf-border">
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Target</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Proxy URL</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Started</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bitmSessions.map((session) => (
                        <tr key={session.id} className="border-b border-msf-border/50 hover:bg-msf-darker">
                          <td className="py-3 px-4">
                            <span className={`flex items-center gap-2 ${
                              session.status === 'active' ? 'text-msf-yellow' :
                              session.status === 'authenticated' ? 'text-msf-green' :
                              session.status === 'closed' ? 'text-gray-500' : 'text-gray-400'
                            }`}>
                              {session.status === 'active' && <div className="w-2 h-2 bg-msf-yellow rounded-full animate-pulse" />}
                              {session.status === 'authenticated' && <CheckCircle className="w-4 h-4" />}
                              {session.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white">{session.target_name}</td>
                          <td className="py-3 px-4">
                            <code className="text-xs text-msf-blue">{session.proxy_url}</code>
                          </td>
                          <td className="py-3 px-4 text-gray-400">
                            {session.created_at ? new Date(session.created_at).toLocaleString() : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(session.proxy_url || '')
                                  notify.info('Copied', 'Proxy URL copied')
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                                title="Copy URL"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              {session.status === 'active' && (
                                <>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.simulateBitMAuth(session.id!)
                                        notify.success('Captured', 'Session authenticated and captured')
                                        fetchBitMData()
                                      } catch (error) {
                                        notify.error('Error', 'Simulation failed')
                                      }
                                    }}
                                    className="p-1 text-msf-green hover:text-msf-green/80"
                                    title="Simulate Auth (Demo)"
                                  >
                                    <Zap className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.stopBitMSession(session.id!)
                                        fetchBitMData()
                                      } catch (error) {
                                        notify.error('Error', 'Failed to stop session')
                                      }
                                    }}
                                    className="p-1 text-gray-400 hover:text-msf-red"
                                    title="Stop"
                                  >
                                    <Square className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={async () => {
                                  if (confirm('Delete this session?')) {
                                    await api.deleteBitMSession(session.id!)
                                    fetchBitMData()
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-msf-red"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Captured Data */}
            {bitmCaptures.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Captured Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-msf-border">
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Target</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Victim IP</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Cookies</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Captured</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bitmCaptures.map((capture) => (
                        <tr key={capture.id} className="border-b border-msf-border/50 hover:bg-msf-darker">
                          <td className="py-3 px-4 text-white">{capture.target_name}</td>
                          <td className="py-3 px-4 font-mono text-gray-400">{capture.victim_ip}</td>
                          <td className="py-3 px-4">
                            <span className="text-msf-green">{Object.keys(capture.cookies).length} cookies</span>
                          </td>
                          <td className="py-3 px-4 text-gray-400">
                            {new Date(capture.captured_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedBitMCapture(capture)
                                  setShowBitMCaptureModal(true)
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  const result = await api.exportBitMCapture(capture.id!, 'cookie-header')
                                  navigator.clipboard.writeText(result.content || '')
                                  notify.success('Copied', 'Cookie header copied')
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                                title="Copy Cookie Header"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  const result = await api.exportBitMCapture(capture.id!, 'json')
                                  navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
                                  notify.success('Copied', 'JSON exported')
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                                title="Export JSON"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm('Delete this capture?')) {
                                    await api.deleteBitMCapture(capture.id!)
                                    fetchBitMData()
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-msf-red"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state */}
            {bitmTargets.length === 0 && bitmSessions.length === 0 && (
              <div className="text-center py-12">
                <Monitor className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg font-medium text-white mb-2">No BitM Attacks Configured</h3>
                <p className="text-gray-400 mb-4">Select a template above to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-white mb-6">SMTP Configuration</h2>

            {smtpConfigs.length === 0 ? (
              <div className="text-center py-12">
                <Settings className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg font-medium text-white mb-2">No SMTP Configuration</h3>
                <p className="text-gray-400 mb-4">Configure SMTP to send phishing emails</p>
                <button
                  onClick={() => setShowSMTPModal(true)}
                  className="btn btn-primary"
                >
                  Configure SMTP
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {smtpConfigs.map((config, index) => (
                  <div
                    key={index}
                    className="bg-msf-darker border border-msf-border rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <Mail className="w-5 h-5 text-msf-blue" />
                      <span className="font-medium text-white">{config.host}:{config.port}</span>
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                        {config.use_tls ? 'TLS' : 'SSL'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">From</p>
                        <p className="text-white">{config.from_name} &lt;{config.from_email}&gt;</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Username</p>
                        <p className="text-white">{config.username}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setShowSMTPModal(true)}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Another
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campaign Creation Modal */}
      {showCampaignModal && (
        <CampaignModal
          templates={[...prebuiltTemplates, ...templates]}
          targetGroups={targetGroups}
          landingPages={[...prebuiltPages, ...landingPages]}
          onClose={() => setShowCampaignModal(false)}
          onCreate={async (campaign) => {
            await api.createPhishingCampaign(campaign)
            notify.success('Campaign Created', `${campaign.name} created successfully`)
            fetchCampaigns()
            setShowCampaignModal(false)
          }}
        />
      )}

      {/* Template Creation Modal */}
      {showTemplateModal && (
        <TemplateModal
          onClose={() => setShowTemplateModal(false)}
          onCreate={async (template) => {
            await api.createEmailTemplate(template)
            notify.success('Template Created', 'Email template saved')
            fetchTemplates()
            setShowTemplateModal(false)
          }}
        />
      )}

      {/* Target Group Modal */}
      {showTargetModal && (
        <TargetGroupModal
          onClose={() => setShowTargetModal(false)}
          onCreate={async (group) => {
            await api.createTargetGroup(group)
            notify.success('Group Created', `${group.name} created with ${group.targets.length} targets`)
            fetchTargetGroups()
            setShowTargetModal(false)
          }}
        />
      )}

      {/* Landing Page Modal */}
      {showLandingModal && (
        <LandingPageModal
          onClose={() => setShowLandingModal(false)}
          onCreate={async (page) => {
            await api.createLandingPage(page)
            notify.success('Page Created', 'Landing page saved')
            fetchLandingPages()
            setShowLandingModal(false)
          }}
          onClone={async (url, name) => {
            await api.cloneWebsite(url, name)
            notify.success('Website Cloned', 'Landing page created from URL')
            fetchLandingPages()
            setShowLandingModal(false)
          }}
        />
      )}

      {/* SMTP Modal */}
      {showSMTPModal && (
        <SMTPModal
          onClose={() => setShowSMTPModal(false)}
          onCreate={async (config) => {
            await api.createSMTPConfig(config)
            notify.success('SMTP Configured', 'Email settings saved')
            fetchSMTPConfigs()
            setShowSMTPModal(false)
          }}
        />
      )}

      {/* Campaign Stats Modal */}
      {showStatsModal && campaignStats && (
        <CampaignStatsModal
          stats={campaignStats}
          onClose={() => {
            setShowStatsModal(false)
            setCampaignStats(null)
          }}
        />
      )}

      {/* Template Preview Modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onUse={() => {
            setShowCampaignModal(true)
            setPreviewTemplate(null)
          }}
        />
      )}

      {/* Landing Page Preview Modal */}
      {previewLandingPage && (
        <LandingPagePreviewModal
          page={previewLandingPage}
          onClose={() => setPreviewLandingPage(null)}
        />
      )}

      {/* BitM Target Creation Modal */}
      {showBitMTargetModal && (
        <BitMTargetModal
          onClose={() => setShowBitMTargetModal(false)}
          onCreate={async (target) => {
            await api.createBitMTarget(target)
            notify.success('Target Created', 'BitM target configured')
            fetchBitMData()
            setShowBitMTargetModal(false)
          }}
        />
      )}

      {/* BitM Session Started Modal */}
      {showBitMSessionModal && bitmSessionResult && (
        <BitMSessionModal
          session={bitmSessionResult.session || null}
          instructions={bitmSessionResult.instructions || []}
          technicalNotes={bitmSessionResult.technical_notes || []}
          onClose={() => {
            setShowBitMSessionModal(false)
            setBitmSessionResult(null)
          }}
        />
      )}

      {/* BitM Capture Detail Modal */}
      {showBitMCaptureModal && selectedBitMCapture && (
        <BitMCaptureModal
          capture={selectedBitMCapture}
          onClose={() => {
            setShowBitMCaptureModal(false)
            setSelectedBitMCapture(null)
          }}
          onExport={async (format) => {
            const result = await api.exportBitMCapture(selectedBitMCapture.id!, format)
            if (format === 'json') {
              navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
            } else {
              navigator.clipboard.writeText(result.content || '')
            }
            notify.success('Exported', `Copied as ${format}`)
          }}
        />
      )}
    </div>
  )
}

// ============== Sub-components ==============

function TargetGroupCard({
  group,
  onDelete,
  onImport,
}: {
  group: TargetGroup
  onDelete: () => void
  onImport: (csv: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [csvData, setCsvData] = useState('')

  return (
    <div className="bg-msf-darker border border-msf-border rounded-lg">
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <Users className="w-5 h-5 text-msf-blue" />
          <div>
            <h4 className="font-medium text-white">{group.name}</h4>
            <p className="text-sm text-gray-400">{group.targets.length} targets</p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowImport(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-msf-dark rounded"
            title="Import CSV"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-msf-red hover:bg-msf-red/10 rounded"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && group.targets.length > 0 && (
        <div className="border-t border-msf-border p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Position</th>
              </tr>
            </thead>
            <tbody>
              {group.targets.slice(0, 10).map((target, i) => (
                <tr key={i} className="border-t border-msf-border/50">
                  <td className="py-2 text-white">{target.email}</td>
                  <td className="py-2 text-gray-400">
                    {target.first_name} {target.last_name}
                  </td>
                  <td className="py-2 text-gray-400">{target.position || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {group.targets.length > 10 && (
            <p className="text-sm text-gray-500 mt-2">
              ... and {group.targets.length - 10} more
            </p>
          )}
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
            <div className="p-4 border-b border-msf-border flex justify-between items-center">
              <h3 className="font-semibold text-white">Import Targets (CSV)</h3>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-400 mb-3">
                Format: email,first_name,last_name,position,department
              </p>
              <textarea
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                placeholder="email,first_name,last_name,position,department&#10;john@example.com,John,Doe,Manager,IT"
                className="input h-40 font-mono text-sm"
              />
            </div>
            <div className="p-4 border-t border-msf-border flex justify-end gap-3">
              <button onClick={() => setShowImport(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  onImport(csvData)
                  setShowImport(false)
                  setCsvData('')
                }}
                className="btn btn-primary"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CampaignModal({
  templates,
  targetGroups,
  landingPages,
  onClose,
  onCreate,
}: {
  templates: EmailTemplate[]
  targetGroups: TargetGroup[]
  landingPages: LandingPage[]
  onClose: () => void
  onCreate: (campaign: Omit<PhishingCampaign, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'total_targets' | 'emails_sent' | 'emails_opened' | 'links_clicked' | 'credentials_captured'>) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [landingPageId, setLandingPageId] = useState('')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Create Campaign</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Campaign Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Q1 Security Awareness"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Email Template *</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="select"
            >
              <option value="">Select template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Target Group *</label>
            <select
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              className="select"
            >
              <option value="">Select target group...</option>
              {targetGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.targets.length} targets)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Landing Page</label>
            <select
              value={landingPageId}
              onChange={(e) => setLandingPageId(e.target.value)}
              className="select"
            >
              <option value="">Select landing page...</option>
              {landingPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => {
              if (name && templateId && targetGroupId) {
                onCreate({
                  name,
                  description,
                  status: 'draft',
                  template_id: templateId,
                  target_group_id: targetGroupId,
                  landing_page_id: landingPageId || undefined,
                })
              }
            }}
            disabled={!name || !templateId || !targetGroupId}
            className="btn btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (template: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>) => void
}) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [category, setCategory] = useState('credential')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Create Email Template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Template Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="Password Reset"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="select"
              >
                <option value="credential">Credential Harvest</option>
                <option value="malware">Malware Delivery</option>
                <option value="awareness">Awareness Test</option>
                <option value="generic">Generic</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Email Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input"
              placeholder="Action Required: {{first_name}}, please verify your account"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Email Body (HTML) *</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="input h-64 font-mono text-sm"
              placeholder="<html>..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'}, {'{{tracking_url}}'}, {'{{tracking_pixel}}'}
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => {
              if (name && subject && bodyHtml) {
                onCreate({ name, subject, body_html: bodyHtml, category })
              }
            }}
            disabled={!name || !subject || !bodyHtml}
            className="btn btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function TargetGroupModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (group: Omit<TargetGroup, 'id' | 'created_at'>) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetsText, setTargetsText] = useState('')

  const parseTargets = (): PhishingTarget[] => {
    return targetsText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim())
        return {
          email: parts[0] || '',
          first_name: parts[1] || undefined,
          last_name: parts[2] || undefined,
          position: parts[3] || undefined,
          department: parts[4] || undefined,
        }
      })
      .filter((t) => t.email.includes('@'))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Create Target Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="IT Department"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Targets (one per line)</label>
            <textarea
              value={targetsText}
              onChange={(e) => setTargetsText(e.target.value)}
              className="input h-40 font-mono text-sm"
              placeholder="email,first_name,last_name,position,department&#10;john@example.com,John,Doe,Manager,IT"
            />
            <p className="text-xs text-gray-500 mt-1">
              {parseTargets().length} valid targets
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => {
              if (name) {
                onCreate({ name, description, targets: parseTargets() })
              }
            }}
            disabled={!name}
            className="btn btn-primary"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function LandingPageModal({
  onClose,
  onCreate,
  onClone,
}: {
  onClose: () => void
  onCreate: (page: Omit<LandingPage, 'id' | 'created_at'>) => void
  onClone: (url: string, name: string) => void
}) {
  const [mode, setMode] = useState<'create' | 'clone'>('clone')
  const [name, setName] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [isCloning, setIsCloning] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Create Landing Page</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('clone')}
              className={`flex-1 py-2 rounded ${
                mode === 'clone'
                  ? 'bg-msf-accent text-white'
                  : 'bg-msf-darker text-gray-400 hover:text-white'
              }`}
            >
              Clone Website
            </button>
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2 rounded ${
                mode === 'create'
                  ? 'bg-msf-accent text-white'
                  : 'bg-msf-darker text-gray-400 hover:text-white'
              }`}
            >
              Custom HTML
            </button>
          </div>

          {mode === 'clone' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Page Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Cloned Login Page"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">URL to Clone *</label>
                <input
                  type="url"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="input"
                  placeholder="https://example.com/login"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Forms will be modified to capture credentials
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Page Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Custom Login Page"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">HTML Content *</label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  className="input h-64 font-mono text-sm"
                  placeholder="<html>..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {'{{page_id}}'} and {'{{tracking_id}}'} in form action
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={async () => {
              if (mode === 'clone' && name && cloneUrl) {
                setIsCloning(true)
                try {
                  await onClone(cloneUrl, name)
                } finally {
                  setIsCloning(false)
                }
              } else if (mode === 'create' && name && htmlContent) {
                onCreate({ name, html_content: htmlContent, capture_credentials: true })
              }
            }}
            disabled={mode === 'clone' ? (!name || !cloneUrl || isCloning) : (!name || !htmlContent)}
            className="btn btn-primary flex items-center gap-2"
          >
            {isCloning && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'clone' ? 'Clone' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SMTPModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (config: Omit<SMTPConfig, 'id' | 'created_at'>) => void
}) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('IT Support')
  const [useTls, setUseTls] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testSMTPConfig({
        host,
        port: parseInt(port),
        username,
        password,
        from_email: fromEmail,
        from_name: fromName,
        use_tls: useTls,
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Configure SMTP</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">SMTP Host *</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="input"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Port *</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="input"
                placeholder="587"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Username *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="App password"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">From Email *</label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="input"
                placeholder="noreply@company.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">From Name</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className="input"
                placeholder="IT Support"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useTls"
              checked={useTls}
              onChange={(e) => setUseTls(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="useTls" className="text-sm text-gray-300">
              Use TLS (recommended)
            </label>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded ${
                testResult.success
                  ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                  : 'bg-red-500/20 border border-red-500/50 text-red-400'
              }`}
            >
              {testResult.success ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> {testResult.message}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> {testResult.message}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-msf-border flex justify-between">
          <button
            onClick={testConnection}
            disabled={!host || !username || !password || !fromEmail || testing}
            className="btn btn-secondary flex items-center gap-2"
          >
            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
            Test Connection
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => {
                if (host && username && password && fromEmail) {
                  onCreate({
                    host,
                    port: parseInt(port),
                    username,
                    password,
                    from_email: fromEmail,
                    from_name: fromName,
                    use_tls: useTls,
                  })
                }
              }}
              disabled={!host || !username || !password || !fromEmail}
              className="btn btn-primary"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CampaignStatsModal({
  stats,
  onClose,
}: {
  stats: CampaignStats
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-msf-border flex justify-between items-center">
          <h3 className="font-semibold text-white">Campaign Statistics</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-msf-darker p-4 rounded-lg text-center">
              <p className="text-3xl font-bold text-white">{stats.stats.emails_sent}</p>
              <p className="text-sm text-gray-400">Emails Sent</p>
            </div>
            <div className="bg-msf-darker p-4 rounded-lg text-center">
              <p className="text-3xl font-bold text-green-400">{stats.stats.open_rate}%</p>
              <p className="text-sm text-gray-400">Open Rate</p>
            </div>
            <div className="bg-msf-darker p-4 rounded-lg text-center">
              <p className="text-3xl font-bold text-yellow-400">{stats.stats.click_rate}%</p>
              <p className="text-sm text-gray-400">Click Rate</p>
            </div>
            <div className="bg-msf-darker p-4 rounded-lg text-center">
              <p className="text-3xl font-bold text-msf-red">{stats.stats.credentials_captured}</p>
              <p className="text-sm text-gray-400">Credentials</p>
            </div>
          </div>

          {/* Progress Funnel */}
          <div className="mb-8">
            <h4 className="text-sm font-medium text-gray-400 mb-3">Conversion Funnel</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-400">Sent</span>
                <div className="flex-1 h-6 bg-msf-darker rounded overflow-hidden">
                  <div className="h-full bg-gray-500" style={{ width: '100%' }} />
                </div>
                <span className="w-12 text-right text-white">{stats.stats.emails_sent}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-400">Opened</span>
                <div className="flex-1 h-6 bg-msf-darker rounded overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${stats.stats.open_rate}%` }}
                  />
                </div>
                <span className="w-12 text-right text-white">{stats.stats.emails_opened}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-400">Clicked</span>
                <div className="flex-1 h-6 bg-msf-darker rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{ width: `${stats.stats.click_rate}%` }}
                  />
                </div>
                <span className="w-12 text-right text-white">{stats.stats.links_clicked}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-400">Captured</span>
                <div className="flex-1 h-6 bg-msf-darker rounded overflow-hidden">
                  <div
                    className="h-full bg-msf-red"
                    style={{ width: `${stats.stats.capture_rate}%` }}
                  />
                </div>
                <span className="w-12 text-right text-white">{stats.stats.credentials_captured}</span>
              </div>
            </div>
          </div>

          {/* Captured Credentials */}
          {stats.credentials.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-3">Captured Credentials</h4>
              <div className="bg-msf-darker rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-msf-border">
                      <th className="text-left p-3 text-gray-400">Username</th>
                      <th className="text-left p-3 text-gray-400">Password</th>
                      <th className="text-left p-3 text-gray-400">IP</th>
                      <th className="text-left p-3 text-gray-400">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.credentials.map((cred) => (
                      <tr key={cred.id} className="border-b border-msf-border/50">
                        <td className="p-3 text-white font-mono">{cred.username}</td>
                        <td className="p-3">
                          <code className="bg-msf-dark px-2 py-1 rounded text-msf-red">
                            {cred.password}
                          </code>
                        </td>
                        <td className="p-3 text-gray-400">{cred.ip_address}</td>
                        <td className="p-3 text-gray-400">
                          {new Date(cred.captured_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

// Template Preview Modal
function TemplatePreviewModal({
  template,
  onClose,
  onUse,
}: {
  template: EmailTemplate
  onClose: () => void
  onUse: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{template.name}</h3>
            <p className="text-sm text-gray-400">Subject: {template.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs bg-msf-purple/20 text-msf-purple rounded">
              {template.category}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded-lg overflow-hidden">
            <iframe
              srcDoc={template.body_html}
              className="w-full h-[500px] border-0"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Variables: {`{{first_name}}, {{last_name}}, {{email}}, {{tracking_url}}`}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
            <button onClick={onUse} className="btn btn-primary">
              Use in Campaign
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Landing Page Preview Modal
function LandingPagePreviewModal({
  page,
  onClose,
}: {
  page: LandingPage
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{page.name}</h3>
            <p className="text-sm text-gray-400">
              Captures: {page.capture_fields?.join(', ')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-white rounded-lg overflow-hidden">
            <iframe
              srcDoc={page.html_content}
              className="w-full h-[600px] border-0"
              title="Landing Page Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {page.cloned_from ? `Cloned from: ${page.cloned_from}` : 'Custom page'}
          </div>
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ============== BitM Modal Components ==============

function BitMTargetModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (target: Omit<BitMTarget, 'id' | 'created_at' | 'sessions_count' | 'captures_count'>) => void
}) {
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [description, setDescription] = useState('')
  const [browserType, setBrowserType] = useState<'chromium' | 'firefox' | 'webkit'>('chromium')
  const [authIndicators, setAuthIndicators] = useState('')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Create BitM Target</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Target"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target URL *</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://login.example.com"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Browser Type</label>
            <select
              value={browserType}
              onChange={(e) => setBrowserType(e.target.value as 'chromium' | 'firefox' | 'webkit')}
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            >
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit (Safari)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Auth Success Indicators (comma-separated URLs/paths)
            </label>
            <input
              type="text"
              value={authIndicators}
              onChange={(e) => setAuthIndicators(e.target.value)}
              placeholder="/dashboard, /home, myaccount"
              className="w-full bg-msf-dark border border-msf-border rounded px-3 py-2 text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              URLs or paths that indicate successful authentication
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            onClick={() => {
              if (name && targetUrl) {
                onCreate({
                  name,
                  target_url: targetUrl,
                  description: description || undefined,
                  browser_type: browserType,
                  viewport_width: 1920,
                  viewport_height: 1080,
                  capture_screenshots: true,
                  capture_network: true,
                  capture_cookies: true,
                  capture_storage: true,
                  auth_indicators: authIndicators.split(',').map(s => s.trim()).filter(Boolean),
                })
              }
            }}
            disabled={!name || !targetUrl}
            className="btn btn-primary"
          >
            Create Target
          </button>
        </div>
      </div>
    </div>
  )
}

function BitMSessionModal({
  session,
  instructions,
  technicalNotes,
  onClose,
}: {
  session: BitMSession | null
  instructions: string[]
  technicalNotes: string[]
  onClose: () => void
}) {
  if (!session) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-msf-yellow" />
              BitM Session Started
            </h3>
            <p className="text-sm text-gray-400">{session.target_name || 'Unknown Target'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* Proxy URL */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Phishing URL</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-msf-darker p-3 rounded text-msf-green text-sm break-all">
                {session.proxy_url}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(session.proxy_url || '')
                }}
                className="p-2 text-gray-400 hover:text-white"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Instructions</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-white">
              {instructions.map((instruction, i) => (
                <li key={i}>{instruction}</li>
              ))}
            </ol>
          </div>

          {/* Technical Notes */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Technical Details</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              {technicalNotes.map((note, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-msf-green mt-0.5 shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          {/* Warning */}
          <div className="bg-msf-yellow/10 border border-msf-yellow/30 rounded-lg p-4">
            <p className="text-msf-yellow text-sm">
              <strong>Important:</strong> Only use this feature in authorized penetration testing engagements.
              Unauthorized use is illegal.
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end">
          <button onClick={onClose} className="btn btn-primary">Got it</button>
        </div>
      </div>
    </div>
  )
}

function BitMCaptureModal({
  capture,
  onClose,
  onExport,
}: {
  capture: CapturedBitMData
  onClose: () => void
  onExport: (format: 'json' | 'cookie-header' | 'cookie-jar' | 'burp') => void
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-msf-card border border-msf-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-msf-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Captured Session</h3>
            <p className="text-sm text-gray-400">{capture.target_name} - {capture.victim_ip}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-3 py-1 bg-msf-green/20 text-msf-green rounded-full text-sm">
              <CheckCircle className="w-4 h-4" />
              Session Captured
            </span>
            <span className="text-sm text-gray-400">
              {new Date(capture.captured_at).toLocaleString()}
            </span>
          </div>

          {/* Cookies */}
          {Object.keys(capture.cookies).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Cookie className="w-4 h-4" />
                Session Cookies ({Object.keys(capture.cookies).length})
              </h4>
              <div className="bg-msf-darker rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                {Object.entries(capture.cookies).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-msf-yellow text-sm">{key}</span>
                    <code className="text-xs text-gray-400 break-all">{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local Storage */}
          {Object.keys(capture.local_storage).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Local Storage</h4>
              <div className="bg-msf-darker rounded-lg p-3 space-y-2">
                {Object.entries(capture.local_storage).map(([key, value]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-msf-purple text-sm">{key}</span>
                    <code className="text-xs text-gray-400 break-all">{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Screenshots */}
          {capture.screenshots.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Screenshots</h4>
              <div className="flex gap-2 overflow-x-auto">
                {capture.screenshots.map((screenshot, i) => (
                  <div key={i} className="flex-shrink-0 w-32 h-20 bg-msf-darker rounded flex items-center justify-center text-gray-500 text-xs">
                    Screenshot {i + 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Options */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Export Cookies</h4>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onExport('cookie-header')} className="btn btn-secondary text-sm">
                Cookie Header
              </button>
              <button onClick={() => onExport('json')} className="btn btn-secondary text-sm">
                JSON
              </button>
              <button onClick={() => onExport('cookie-jar')} className="btn btn-secondary text-sm">
                Netscape Format
              </button>
              <button onClick={() => onExport('burp')} className="btn btn-secondary text-sm">
                Burp Format
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-msf-border flex justify-end">
          <button onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>
    </div>
  )
}

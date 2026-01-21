import axios, { AxiosInstance } from 'axios'
import { AuthToken, Session, Module, Job, ModuleStats, PayloadTemplate, Target, TargetCreate, Service, ServiceCreate, Credential, CredentialCreate, PostModule, ProcessInfo, FileInfo, SystemInfo, Workflow, WorkflowStep, WorkflowTemplate, ActivityLogEntry, Report, ReportConfig, ReportData } from '../types'

const API_BASE = '/api/v1'

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`
      }
      return config
    })

    // Load token from storage
    this.token = localStorage.getItem('token')
  }

  setToken(token: string) {
    this.token = token
    localStorage.setItem('token', token)
  }

  clearToken() {
    this.token = null
    localStorage.removeItem('token')
  }

  // Auth
  async login(username: string, password: string): Promise<AuthToken> {
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    const response = await this.client.post<AuthToken>('/auth/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.setToken(response.data.access_token)
    return response.data
  }

  async getCurrentUser() {
    return (await this.client.get('/auth/me')).data
  }

  // Sessions
  async getSessions(): Promise<{ sessions: Session[]; count: number }> {
    return (await this.client.get('/sessions')).data
  }

  async getSession(id: number): Promise<Session> {
    return (await this.client.get(`/sessions/${id}`)).data
  }

  async killSession(id: number): Promise<void> {
    await this.client.delete(`/sessions/${id}`)
  }

  async sessionShellWrite(id: number, command: string): Promise<void> {
    await this.client.post(`/sessions/${id}/shell/write`, { command })
  }

  async sessionShellRead(id: number): Promise<{ output: string }> {
    return (await this.client.get(`/sessions/${id}/shell/read`)).data
  }

  async sessionMeterpreterRun(id: number, command: string): Promise<{ output: string }> {
    return (await this.client.post(`/sessions/${id}/meterpreter/run`, { command })).data
  }

  // Modules
  async getModuleStats(): Promise<ModuleStats> {
    return (await this.client.get('/modules/stats')).data
  }

  async getModuleTypes() {
    return (await this.client.get('/modules/types')).data
  }

  async listModules(
    type: string,
    offset = 0,
    limit = 100,
    search?: string
  ): Promise<{ modules: string[]; total: number }> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    if (search) params.append('search', search)
    return (await this.client.get(`/modules/${type}?${params}`)).data
  }

  async searchModules(query: string, type?: string): Promise<{ results: Module[]; count: number }> {
    const params = new URLSearchParams({ q: query })
    if (type) params.append('type', type)
    return (await this.client.get(`/modules/search?${params}`)).data
  }

  async getModuleInfo(type: string, name: string): Promise<Module> {
    return (await this.client.get(`/modules/${type}/${name}/info`)).data
  }

  async getCompatiblePayloads(type: string, name: string): Promise<{ payloads: string[]; count: number }> {
    return (await this.client.get(`/modules/${type}/${name}/payloads`)).data
  }

  async executeModule(
    type: string,
    name: string,
    options: Record<string, unknown>,
    payload?: string,
    payloadOptions?: Record<string, unknown>
  ) {
    return (
      await this.client.post(`/modules/${type}/${name}/execute`, {
        options,
        payload,
        payload_options: payloadOptions,
      })
    ).data
  }

  // Console
  async listConsoles(): Promise<{ consoles: string[]; count: number }> {
    return (await this.client.get('/console')).data
  }

  async createConsole(): Promise<{ id: string }> {
    return (await this.client.post('/console')).data
  }

  async destroyConsole(id: string): Promise<void> {
    await this.client.delete(`/console/${id}`)
  }

  async readConsole(id: string): Promise<{ data: string; prompt: string; busy: boolean }> {
    return (await this.client.get(`/console/${id}`)).data
  }

  async writeConsole(id: string, command: string): Promise<void> {
    await this.client.post(`/console/${id}`, { command })
  }

  // Jobs / Listeners
  async listJobs(): Promise<{ jobs: Job[]; count: number }> {
    return (await this.client.get('/listeners/jobs')).data
  }

  async getJobInfo(id: string): Promise<Job> {
    return (await this.client.get(`/listeners/jobs/${id}`)).data
  }

  async killJob(id: string): Promise<void> {
    await this.client.delete(`/listeners/jobs/${id}`)
  }

  async createHandler(
    payload: string,
    lhost: string,
    lport: number,
    options?: Record<string, unknown>
  ) {
    return (
      await this.client.post('/listeners/handler', {
        payload,
        lhost,
        lport,
        options,
      })
    ).data
  }

  async getCommonPayloads() {
    return (await this.client.get('/listeners/payloads')).data
  }

  // Payloads
  async getPayloadFormats() {
    return (await this.client.get('/payloads/formats')).data
  }

  async getPayloadEncoders(): Promise<{ encoders: unknown[]; count: number }> {
    return (await this.client.get('/payloads/encoders')).data
  }

  async getPayloadOptions(name: string) {
    return (await this.client.get(`/payloads/${name}/options`)).data
  }

  async getPayloadTemplates(): Promise<{ templates: PayloadTemplate[] }> {
    return (await this.client.get('/payloads/templates')).data
  }

  async generatePayload(
    payload: string,
    format: string,
    options: Record<string, unknown>,
    encoder?: string,
    iterations?: number,
    badChars?: string
  ): Promise<Blob> {
    const response = await this.client.post(
      '/payloads/generate',
      {
        payload,
        format,
        options,
        encoder: encoder || null,
        iterations: iterations || 1,
        bad_chars: badChars || null
      },
      { responseType: 'blob' }
    )
    return response.data
  }

  async hostPayload(
    payload: string,
    format: string,
    options: Record<string, unknown>,
    filename?: string,
    expireHours?: number,
    encoder?: string,
    urlPath?: string
  ) {
    return (await this.client.post('/payloads/host', {
      payload,
      format,
      options,
      filename,
      expire_hours: expireHours || 24,
      encoder: encoder || null,
      url_path: urlPath || null
    })).data
  }

  async getHostedPayloads() {
    return (await this.client.get('/payloads/hosted')).data
  }

  async deleteHostedPayload(id: string) {
    return (await this.client.delete(`/payloads/hosted/${id}`)).data
  }

  // Health
  async getHealth() {
    return (await axios.get('/health')).data
  }

  // Targets
  async getTargets(filters?: { status?: string; group?: string; tag?: string }): Promise<{
    targets: Target[]
    count: number
    groups: string[]
    tags: string[]
  }> {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.group) params.append('group', filters.group)
    if (filters?.tag) params.append('tag', filters.tag)
    const query = params.toString() ? `?${params}` : ''
    return (await this.client.get(`/targets${query}`)).data
  }

  async getTarget(id: string): Promise<Target> {
    return (await this.client.get(`/targets/${id}`)).data
  }

  async createTarget(target: TargetCreate): Promise<Target> {
    return (await this.client.post('/targets', target)).data
  }

  async updateTarget(id: string, update: Partial<TargetCreate>): Promise<Target> {
    return (await this.client.put(`/targets/${id}`, update)).data
  }

  async deleteTarget(id: string): Promise<void> {
    await this.client.delete(`/targets/${id}`)
  }

  async importTargets(targets: TargetCreate[]): Promise<{ imported: number; skipped: number }> {
    return (await this.client.post('/targets/import', { targets })).data
  }

  async bulkUpdateTargetStatus(targetIds: string[], status: string): Promise<{ updated: number }> {
    return (await this.client.post('/targets/bulk/status', { target_ids: targetIds, status })).data
  }

  async bulkDeleteTargets(targetIds: string[]): Promise<{ deleted: number }> {
    return (await this.client.delete('/targets/bulk', { data: { target_ids: targetIds } })).data
  }

  async getTargetStats(): Promise<{
    total: number
    by_status: Record<string, number>
    by_os: Record<string, number>
    by_group: Record<string, number>
    total_services: number
  }> {
    return (await this.client.get('/targets/stats/summary')).data
  }

  // Target Services
  async addService(targetId: string, service: ServiceCreate): Promise<Service> {
    return (await this.client.post(`/targets/${targetId}/services`, service)).data
  }

  async getServices(targetId: string): Promise<{ services: Service[]; count: number }> {
    return (await this.client.get(`/targets/${targetId}/services`)).data
  }

  async deleteService(targetId: string, serviceId: string): Promise<void> {
    await this.client.delete(`/targets/${targetId}/services/${serviceId}`)
  }

  // Nmap Scanning
  async getNmapProfiles(): Promise<{
    profiles: Array<{
      id: string
      name: string
      description: string
      args: string
    }>
  }> {
    return (await this.client.get('/nmap/profiles')).data
  }

  async startNmapScan(
    targets: string,
    profile: string,
    customArgs?: string,
    importResults: boolean = true
  ): Promise<{ scan_id: string; status: string; message: string }> {
    return (
      await this.client.post('/nmap/scan', {
        targets,
        profile,
        custom_args: customArgs,
        import_results: importResults,
      })
    ).data
  }

  async getNmapScans(): Promise<{
    scans: Array<{
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
    }>
    active: number
    completed: number
  }> {
    return (await this.client.get('/nmap/scans')).data
  }

  async getNmapScan(scanId: string) {
    return (await this.client.get(`/nmap/scans/${scanId}`)).data
  }

  async deleteNmapScan(scanId: string): Promise<void> {
    await this.client.delete(`/nmap/scans/${scanId}`)
  }

  // Post-Exploitation Modules
  async getPostModules(filters?: { platform?: string; search?: string }): Promise<{
    modules: PostModule[]
    count: number
    platforms: string[]
    categories: string[]
  }> {
    const params = new URLSearchParams()
    if (filters?.platform) params.append('platform', filters.platform)
    if (filters?.search) params.append('search', filters.search)
    const query = params.toString() ? `?${params}` : ''
    return (await this.client.get(`/postex/modules${query}`)).data
  }

  async getPostModuleInfo(modulePath: string): Promise<Module> {
    return (await this.client.get(`/postex/modules/${modulePath}/info`)).data
  }

  async runPostModule(module: string, options: Record<string, unknown>): Promise<{ job_id?: string; uuid?: string; status: string }> {
    return (await this.client.post('/postex/modules/run', { module, options })).data
  }

  // Credential Vault
  async getCredentials(filters?: { host?: string; service?: string }): Promise<{
    credentials: Credential[]
    count: number
    hosts: string[]
    services: string[]
  }> {
    const params = new URLSearchParams()
    if (filters?.host) params.append('host', filters.host)
    if (filters?.service) params.append('service', filters.service)
    const query = params.toString() ? `?${params}` : ''
    return (await this.client.get(`/postex/credentials${query}`)).data
  }

  async addCredential(cred: CredentialCreate): Promise<Credential> {
    return (await this.client.post('/postex/credentials', cred)).data
  }

  async updateCredential(id: string, update: Partial<CredentialCreate>): Promise<Credential> {
    return (await this.client.put(`/postex/credentials/${id}`, update)).data
  }

  async deleteCredential(id: string): Promise<void> {
    await this.client.delete(`/postex/credentials/${id}`)
  }

  async clearCredentials(): Promise<void> {
    await this.client.delete('/postex/credentials')
  }

  // Meterpreter File Browser
  async listFiles(sessionId: number, path: string = '.'): Promise<{
    path: string
    files: FileInfo[]
    count: number
  }> {
    return (await this.client.get(`/postex/sessions/${sessionId}/files`, { params: { path } })).data
  }

  async getPwd(sessionId: number): Promise<{ path: string }> {
    return (await this.client.get(`/postex/sessions/${sessionId}/files/pwd`)).data
  }

  async downloadFile(sessionId: number, path: string): Promise<{
    filename: string
    content: string
    size: number
  }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/files/download`, { path })).data
  }

  async uploadFile(sessionId: number, destination: string, file: File): Promise<{
    success: boolean
    message: string
    destination: string
  }> {
    const formData = new FormData()
    formData.append('file', file)
    return (await this.client.post(`/postex/sessions/${sessionId}/files/upload?destination=${encodeURIComponent(destination)}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })).data
  }

  // Process Management
  async listProcesses(sessionId: number): Promise<{
    processes: ProcessInfo[]
    count: number
  }> {
    return (await this.client.get(`/postex/sessions/${sessionId}/processes`)).data
  }

  async killProcess(sessionId: number, pid: number): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/processes/kill`, { pid })).data
  }

  async migrateProcess(sessionId: number, pid: number): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/processes/migrate`, { pid })).data
  }

  // System Info
  async getSysinfo(sessionId: number): Promise<SystemInfo> {
    return (await this.client.get(`/postex/sessions/${sessionId}/sysinfo`)).data
  }

  async getUid(sessionId: number): Promise<{ user: string }> {
    return (await this.client.get(`/postex/sessions/${sessionId}/getuid`)).data
  }

  async getPrivs(sessionId: number): Promise<{ privileges: string[]; count: number }> {
    return (await this.client.get(`/postex/sessions/${sessionId}/getprivs`)).data
  }

  // Privilege Escalation
  async getSystem(sessionId: number): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/getsystem`)).data
  }

  async suggestExploits(sessionId: number): Promise<{ job_id?: string; uuid?: string; status: string }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/suggest`)).data
  }

  // Hashdump
  async hashdump(sessionId: number): Promise<{
    hashes: Array<{ username: string; rid: string; lm_hash: string; ntlm_hash: string }>
    count: number
    raw: string
  }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/hashdump`)).data
  }

  // Screenshot
  async takeScreenshot(sessionId: number): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/postex/sessions/${sessionId}/screenshot`)).data
  }

  // ==================== Automation ====================

  // Workflow Templates
  async getWorkflowTemplates(): Promise<{ templates: WorkflowTemplate[] }> {
    return (await this.client.get('/automation/templates')).data
  }

  async getWorkflowTemplate(templateId: string): Promise<{ name: string; description: string; steps: WorkflowStep[] }> {
    return (await this.client.get(`/automation/templates/${templateId}`)).data
  }

  // Workflows
  async getWorkflows(status?: string): Promise<{ workflows: Workflow[]; count: number; running: number }> {
    const params = status ? `?status=${status}` : ''
    return (await this.client.get(`/automation${params}`)).data
  }

  async getWorkflow(workflowId: string): Promise<Workflow> {
    return (await this.client.get(`/automation/${workflowId}`)).data
  }

  async createWorkflow(workflow: {
    name: string
    description?: string
    target_session?: number
    target_host?: string
    steps: WorkflowStep[]
    tags?: string[]
  }): Promise<Workflow> {
    return (await this.client.post('/automation', workflow)).data
  }

  async createWorkflowFromTemplate(
    templateId: string,
    name?: string,
    targetSession?: number,
    targetHost?: string
  ): Promise<Workflow> {
    const params = new URLSearchParams()
    if (name) params.append('name', name)
    if (targetSession) params.append('target_session', String(targetSession))
    if (targetHost) params.append('target_host', targetHost)
    const query = params.toString() ? `?${params}` : ''
    return (await this.client.post(`/automation/from-template/${templateId}${query}`)).data
  }

  async updateWorkflow(workflowId: string, update: Partial<Workflow>): Promise<Workflow> {
    return (await this.client.put(`/automation/${workflowId}`, update)).data
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.client.delete(`/automation/${workflowId}`)
  }

  async runWorkflow(workflowId: string): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/automation/${workflowId}/run`)).data
  }

  async stopWorkflow(workflowId: string): Promise<{ success: boolean; message: string }> {
    return (await this.client.post(`/automation/${workflowId}/stop`)).data
  }

  async duplicateWorkflow(workflowId: string): Promise<Workflow> {
    return (await this.client.post(`/automation/${workflowId}/duplicate`)).data
  }

  // Activity Log
  async getActivityLog(limit: number = 100, action?: string, status?: string): Promise<{
    entries: ActivityLogEntry[]
    count: number
    total: number
  }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (action) params.append('action', action)
    if (status) params.append('status', status)
    return (await this.client.get(`/automation/activity/log?${params}`)).data
  }

  async addActivityLog(entry: { action: string; details: string; target?: string; status?: string }): Promise<ActivityLogEntry> {
    return (await this.client.post('/automation/activity/log', entry)).data
  }

  async clearActivityLog(): Promise<void> {
    await this.client.delete('/automation/activity/log')
  }

  // ==================== Reports ====================

  async getReports(): Promise<{ reports: Report[]; count: number }> {
    return (await this.client.get('/reports')).data
  }

  async getReport(reportId: string): Promise<Report> {
    return (await this.client.get(`/reports/${reportId}`)).data
  }

  async createReport(config: ReportConfig): Promise<Report> {
    return (await this.client.post('/reports', config)).data
  }

  async previewReport(config: Partial<ReportConfig>): Promise<ReportData> {
    const params = new URLSearchParams()
    if (config.include_targets !== undefined) params.append('include_targets', String(config.include_targets))
    if (config.include_credentials !== undefined) params.append('include_credentials', String(config.include_credentials))
    if (config.include_activity !== undefined) params.append('include_activity', String(config.include_activity))
    if (config.include_scans !== undefined) params.append('include_scans', String(config.include_scans))
    if (config.include_workflows !== undefined) params.append('include_workflows', String(config.include_workflows))
    if (config.date_from) params.append('date_from', config.date_from)
    if (config.date_to) params.append('date_to', config.date_to)
    return (await this.client.get(`/reports/preview?${params}`)).data
  }

  async exportReportHtml(reportId: string): Promise<Blob> {
    const response = await this.client.get(`/reports/${reportId}/export/html`, { responseType: 'blob' })
    return response.data
  }

  async exportReportJson(reportId: string): Promise<Blob> {
    const response = await this.client.get(`/reports/${reportId}/export/json`, { responseType: 'blob' })
    return response.data
  }

  async deleteReport(reportId: string): Promise<void> {
    await this.client.delete(`/reports/${reportId}`)
  }

  async getEngagementStats(): Promise<{
    targets: { total: number; compromised: number; online: number }
    services: { total: number }
    credentials: { total: number; with_password: number; with_hash: number }
    workflows: { total: number; completed: number; running: number }
    scans: { total: number }
    activity: { total: number }
  }> {
    return (await this.client.get('/reports/stats/summary')).data
  }
}

export const api = new ApiClient()

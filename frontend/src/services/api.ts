import axios, { AxiosInstance } from 'axios'
import { AuthToken, Session, Module, Job, ModuleStats, PayloadTemplate, Target, TargetCreate, Service, ServiceCreate } from '../types'

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
}

export const api = new ApiClient()

export interface Session {
  id: number
  type: 'meterpreter' | 'shell' | string
  tunnel_local: string
  tunnel_peer: string
  via_exploit: string
  via_payload: string
  desc: string
  info: string
  workspace: string
  session_host: string
  session_port: number
  target_host: string
  username: string
  uuid: string
  exploit_uuid: string
  routes: string[]
  arch: string
  platform: string
}

export interface Module {
  name: string
  fullname?: string
  type: string
  description?: string
  authors?: string[]
  references?: string[]
  options?: Record<string, ModuleOption>
  required_options?: string[]
}

export interface ModuleOption {
  type?: string
  required: boolean
  description: string
  default: string | number | boolean | null
  value?: string | number | boolean | null
  advanced?: boolean
  evasion?: boolean
}

export interface Job {
  id: string
  name: string
  start_time?: number
}

export interface Console {
  id: string
  prompt: string
  busy: boolean
}

export interface Target {
  id: string
  ip: string
  hostname?: string
  os?: string
  os_family?: string
  arch?: string
  status: 'unknown' | 'online' | 'offline' | 'compromised'
  tags: string[]
  notes?: string
  group?: string
  created_at: string
  updated_at: string
  services: Service[]
  session_count: number
}

export interface TargetCreate {
  ip: string
  hostname?: string
  os?: string
  os_family?: string
  arch?: string
  status?: string
  tags?: string[]
  notes?: string
  group?: string
}

export interface Service {
  id: string
  host_id: string
  port: number
  protocol: 'tcp' | 'udp'
  service: string
  version?: string
  banner?: string
  state: 'open' | 'filtered' | 'closed'
  created_at: string
}

export interface ServiceCreate {
  port: number
  protocol?: string
  service?: string
  version?: string
  banner?: string
  state?: string
}

export interface Vulnerability {
  id: string
  host: string
  name: string
  refs?: string[]
  info?: string
}

export interface Credential {
  id: string
  username: string
  password?: string
  hash?: string
  hash_type?: string
  domain?: string
  host?: string
  service?: string
  port?: number
  notes?: string
  source?: string
  created_at: string
  updated_at: string
}

export interface CredentialCreate {
  username: string
  password?: string
  hash?: string
  hash_type?: string
  domain?: string
  host?: string
  service?: string
  port?: number
  notes?: string
  source?: string
}

export interface PostModule {
  name: string
  fullname: string
  platform: string
  category: string
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  arch: string
  session: string
  user: string
  path: string
}

export interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size: number
  mode: string
  modified: string
}

export interface SystemInfo {
  computer?: string
  os?: string
  architecture?: string
  system_language?: string
  domain?: string
  logged_on_users?: string
  meterpreter?: string
}

export interface WorkflowStep {
  id?: string
  type: 'exploit' | 'auxiliary' | 'post' | 'command' | 'delay'
  name: string
  module?: string
  command?: string
  options?: Record<string, unknown>
  delay_seconds?: number
  continue_on_fail?: boolean
  description?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  target_session?: number
  target_host?: string
  steps: WorkflowStep[]
  tags: string[]
  status: 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'paused'
  created_at: string
  updated_at: string
  created_by?: string
  current_step?: number
  results?: WorkflowStepResult[]
  error?: string
}

export interface WorkflowStepResult {
  step_index: number
  step_name: string
  type: string
  started_at: string
  completed_at?: string
  status: 'running' | 'success' | 'failed'
  output: string
  error?: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  step_count: number
}

export interface ActivityLogEntry {
  id: string
  timestamp: string
  action: string
  details: string
  user?: string
  target?: string
  session_id?: number
  status: 'info' | 'success' | 'warning' | 'error'
}

export interface Report {
  id: string
  name: string
  description?: string
  type: 'engagement' | 'executive' | 'technical'
  config: ReportConfig
  data: ReportData
  created_at: string
  created_by?: string
}

export interface ReportConfig {
  name: string
  description?: string
  type?: string
  include_targets?: boolean
  include_credentials?: boolean
  include_activity?: boolean
  include_scans?: boolean
  include_workflows?: boolean
  date_from?: string
  date_to?: string
}

export interface ReportData {
  generated_at: string
  summary: {
    total_targets?: number
    compromised_targets?: number
    total_services?: number
    total_credentials?: number
    total_activities?: number
    total_scans?: number
    total_workflows?: number
  }
  targets?: { items: Target[]; count: number }
  credentials?: { items: Credential[]; count: number }
  activity?: { items: ActivityLogEntry[]; count: number }
}

export interface Listener {
  job_id: string
  payload: string
  lhost: string
  lport: number
  status: 'running' | 'stopped'
}

export interface PayloadTemplate {
  name: string
  payload: string
  format: string
  platform?: string
  arch?: string
  options: Record<string, string | number>
}

export interface ModuleStats {
  exploits: number
  payloads: number
  auxiliaries: number
  post: number
  encoders: number
  nops: number
}

export interface ApiError {
  detail: string
}

export interface User {
  username: string
  disabled?: boolean
}

export interface AuthToken {
  access_token: string
  token_type: string
}

// ============== Phishing Types ==============

export interface SMTPConfig {
  id?: string
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name?: string
  use_tls?: boolean
  created_at?: string
}

export interface EmailTemplate {
  id?: string
  name: string
  subject: string
  body_html: string
  body_text?: string
  category?: string
  created_at?: string
  updated_at?: string
}

export interface PhishingTarget {
  id?: string
  email: string
  first_name?: string
  last_name?: string
  position?: string
  department?: string
  custom_fields?: Record<string, string>
}

export interface TargetGroup {
  id?: string
  name: string
  description?: string
  targets: PhishingTarget[]
  created_at?: string
}

export interface LandingPage {
  id?: string
  name: string
  html_content: string
  capture_credentials?: boolean
  capture_fields?: string[]
  redirect_url?: string
  cloned_from?: string
  created_at?: string
}

export interface PhishingCampaign {
  id?: string
  name: string
  description?: string
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed'
  template_id: string
  landing_page_id?: string
  target_group_id: string
  smtp_config_id?: string
  scheduled_at?: string
  send_interval_seconds?: number
  track_opens?: boolean
  track_clicks?: boolean
  total_targets: number
  emails_sent: number
  emails_opened: number
  links_clicked: number
  credentials_captured: number
  created_at?: string
  updated_at?: string
  completed_at?: string
  error?: string
}

export interface CapturedCredential {
  id: string
  campaign_id: string
  target_id: string
  target_email: string
  username?: string
  password?: string
  other_fields?: Record<string, string>
  ip_address: string
  user_agent: string
  captured_at: string
}

export interface TrackingEvent {
  id: string
  campaign_id: string
  target_id: string
  event_type: 'email_sent' | 'email_opened' | 'link_clicked' | 'creds_submitted'
  ip_address?: string
  user_agent?: string
  timestamp: string
}

export interface CampaignStats {
  campaign: PhishingCampaign
  stats: {
    total_targets: number
    emails_sent: number
    emails_opened: number
    links_clicked: number
    credentials_captured: number
    open_rate: number
    click_rate: number
    capture_rate: number
  }
  events: TrackingEvent[]
  credentials: CapturedCredential[]
}

// ============== EvilProxy (2FA Bypass) ==============

export interface Phishlet {
  id?: string
  name: string
  description?: string
  target_domain: string
  phishing_domain: string
  proxy_port: number
  ssl_enabled: boolean
  capture_cookies: string[]
  capture_fields: string[]
  auth_urls: string[]
  replacements: Record<string, string>
  status: 'stopped' | 'running'
  created_at?: string
}

export interface PhishletTemplate {
  id: string
  name: string
  description: string
  target_domain: string
  phishing_domain: string
  capture_cookies: string[]
  capture_fields: string[]
  auth_urls: string[]
  replacements: Record<string, string>
}

export interface CapturedProxySession {
  id?: string
  phishlet_id: string
  victim_ip: string
  user_agent: string
  credentials: Record<string, string>
  cookies: Record<string, string>
  tokens: Record<string, string>
  authenticated: boolean
  captured_at: string
  last_activity: string
}

export interface EvilProxyStats {
  total_phishlets: number
  running_phishlets: number
  total_sessions: number
  authenticated_sessions: number
  credentials_captured: number
  cookies_captured: number
}

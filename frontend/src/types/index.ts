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
  host?: string
  service?: string
  username: string
  password?: string
  hash?: string
  type: 'password' | 'hash' | 'ssh_key'
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

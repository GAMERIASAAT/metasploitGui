import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const SERVER_URL_KEY = 'server_url'
const DEFAULT_SERVER_URL = 'http://localhost:8000'

class ServerConfig {
  private serverUrl: string = DEFAULT_SERVER_URL
  private initialized: boolean = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: SERVER_URL_KEY })
      if (value) {
        this.serverUrl = value
      }
    }
    this.initialized = true
  }

  async getServerUrl(): Promise<string> {
    await this.initialize()
    return this.serverUrl
  }

  getServerUrlSync(): string {
    return this.serverUrl
  }

  async setServerUrl(url: string): Promise<void> {
    this.serverUrl = url.replace(/\/$/, '') // Remove trailing slash
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: SERVER_URL_KEY, value: this.serverUrl })
    }
  }

  getApiBaseUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return `${this.serverUrl}/api/v1`
    }
    return '/api/v1'
  }

  getSocketUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return this.serverUrl
    }
    return '/'
  }

  isNative(): boolean {
    return Capacitor.isNativePlatform()
  }

  getPlatform(): string {
    return Capacitor.getPlatform()
  }
}

export const serverConfig = new ServerConfig()

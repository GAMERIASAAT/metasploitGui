import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import App from './App'
import { serverConfig } from './services/serverConfig'
import { api } from './services/api'
import { socketService } from './services/socket'
import './index.css'

// Initialize Capacitor services
async function initializeApp() {
  console.log('MSF GUI App Version: 2.0 - Initializing...')
  // Initialize server configuration
  await serverConfig.initialize()

  // Update API and Socket with configured URLs
  if (Capacitor.isNativePlatform()) {
    api.updateBaseUrl(serverConfig.getApiBaseUrl())
    socketService.setServerUrl(serverConfig.getSocketUrl())
  }
}

// Initialize then render
initializeApp().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})

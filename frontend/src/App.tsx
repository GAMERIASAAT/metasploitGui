import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useTerminalStore } from './store/terminalStore'
import { socketService } from './services/socket'
import { serverConfig } from './services/serverConfig'
import { useSessionNotifications } from './hooks/useNotifications'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { useStatusBar } from './hooks/useStatusBar'
import { useSplashScreen } from './hooks/useSplashScreen'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import Layout from './components/common/Layout'
import Login from './components/common/Login'
import Toast from './components/common/Toast'
import Dashboard from './components/dashboard/Dashboard'
import Sessions from './components/sessions/Sessions'
import Modules from './components/modules/Modules'
import Listeners from './components/listeners/Listeners'
import Payloads from './components/payloads/Payloads'
import Targets from './components/targets/Targets'
import PostExploitation from './components/postex/PostExploitation'
import Automation from './components/automation/Automation'
import Reports from './components/reports/Reports'
import Phishing from './components/phishing/Phishing'
import NetworkVisualization from './components/network/NetworkVisualization'
import Terminal from './components/terminal/Terminal'
import MobileTerminal from './components/terminal/MobileTerminal'
import SessionTerminal from './components/sessions/SessionTerminal'
import ServerSettings from './components/settings/ServerSettings'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function NetworkStatusBanner({ connected }: { connected: boolean }) {
  if (connected) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-msf-red text-white text-center py-2 text-sm z-50 safe-area-top">
      No network connection
    </div>
  )
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const { activeSessionTerminal, closeSessionTerminal } = useTerminalStore()
  const location = useLocation()
  const isNative = serverConfig.isNative()

  // Mobile hooks
  useAndroidBackButton()
  useStatusBar()
  useSplashScreen()
  const { connected } = useNetworkStatus()

  // Enable session notifications
  useSessionNotifications()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated) {
      socketService.connect()
      socketService.subscribeSessions()
    }
    return () => {
      socketService.disconnect()
    }
  }, [isAuthenticated])

  const isTerminalRoute = location.pathname === '/terminal'

  // Use mobile terminal on native platforms
  const TerminalComponent = isNative ? MobileTerminal : Terminal

  return (
    <>
      <NetworkStatusBanner connected={connected} />

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sessions" element={<Sessions />} />
                  <Route path="/modules" element={<Modules />} />
                  <Route path="/listeners" element={<Listeners />} />
                  <Route path="/payloads" element={<Payloads />} />
                  <Route path="/targets" element={<Targets />} />
                  <Route path="/postex" element={<PostExploitation />} />
                  <Route path="/automation" element={<Automation />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/phishing" element={<Phishing />} />
                  <Route path="/network" element={<NetworkVisualization />} />
                  <Route path="/settings" element={<ServerSettings />} />
                  {/* Terminal placeholder - actual Terminal rendered below for persistence */}
                  <Route path="/terminal" element={null} />
                </Routes>
                {/* Persistent Terminal - always mounted, visibility controlled by route */}
                {isAuthenticated && <TerminalComponent visible={isTerminalRoute} />}
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>

      {/* Global Session Terminal - persists across page navigation */}
      {activeSessionTerminal && (
        <SessionTerminal
          session={activeSessionTerminal}
          onClose={closeSessionTerminal}
        />
      )}

      {/* Toast notifications */}
      <Toast />
    </>
  )
}

export default App

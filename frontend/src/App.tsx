import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useTerminalStore } from './store/terminalStore'
import { socketService } from './services/socket'
import Layout from './components/common/Layout'
import Login from './components/common/Login'
import Dashboard from './components/dashboard/Dashboard'
import Sessions from './components/sessions/Sessions'
import Modules from './components/modules/Modules'
import Listeners from './components/listeners/Listeners'
import Payloads from './components/payloads/Payloads'
import Terminal from './components/terminal/Terminal'
import SessionTerminal from './components/sessions/SessionTerminal'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const { activeSessionTerminal, closeSessionTerminal } = useTerminalStore()
  const location = useLocation()

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

  return (
    <>
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
                  {/* Terminal placeholder - actual Terminal rendered below for persistence */}
                  <Route path="/terminal" element={null} />
                </Routes>
                {/* Persistent Terminal - always mounted, visibility controlled by route */}
                {isAuthenticated && <Terminal visible={isTerminalRoute} />}
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
    </>
  )
}

export default App

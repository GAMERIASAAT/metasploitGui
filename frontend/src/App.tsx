import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { socketService } from './services/socket'
import Layout from './components/common/Layout'
import Login from './components/common/Login'
import Dashboard from './components/dashboard/Dashboard'
import Sessions from './components/sessions/Sessions'
import Modules from './components/modules/Modules'
import Listeners from './components/listeners/Listeners'
import Payloads from './components/payloads/Payloads'
import Terminal from './components/terminal/Terminal'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()

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

  return (
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
                <Route path="/terminal" element={<Terminal />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App

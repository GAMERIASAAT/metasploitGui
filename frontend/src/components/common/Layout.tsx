import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { serverConfig } from '../../services/serverConfig'
import NotificationCenter from './NotificationCenter'
import BottomNav from './BottomNav'
import {
  LayoutDashboard,
  Users,
  Box,
  Radio,
  FileCode,
  Terminal,
  LogOut,
  Menu,
  Shield,
  Monitor,
  Crosshair,
  GitBranch,
  FileText,
  Mail,
  Network,
  X,
  Server,
} from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/targets', label: 'Targets', icon: Monitor },
  { path: '/sessions', label: 'Sessions', icon: Users },
  { path: '/postex', label: 'Post-Exploit', icon: Crosshair },
  { path: '/modules', label: 'Modules', icon: Box },
  { path: '/listeners', label: 'Listeners', icon: Radio },
  { path: '/payloads', label: 'Payloads', icon: FileCode },
  { path: '/phishing', label: 'Phishing', icon: Mail },
  { path: '/network', label: 'Network Map', icon: Network },
  { path: '/automation', label: 'Automation', icon: GitBranch },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/terminal', label: 'Terminal', icon: Terminal },
]

// Items not in bottom nav that appear in "More" drawer
const moreNavItems = [
  { path: '/targets', label: 'Targets', icon: Monitor },
  { path: '/postex', label: 'Post-Exploit', icon: Crosshair },
  { path: '/payloads', label: 'Payloads', icon: FileCode },
  { path: '/phishing', label: 'Phishing', icon: Mail },
  { path: '/network', label: 'Network Map', icon: Network },
  { path: '/automation', label: 'Automation', icon: GitBranch },
  { path: '/reports', label: 'Reports', icon: FileText },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false)
  const isNative = serverConfig.isNative()

  const handleMoreNavClick = (path: string) => {
    setMoreDrawerOpen(false)
    navigate(path)
  }

  return (
    <div className="min-h-screen bg-msf-dark flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* More drawer backdrop (mobile native only) */}
      {moreDrawerOpen && isNative && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMoreDrawerOpen(false)}
        />
      )}

      {/* More drawer (mobile native) */}
      {isNative && (
        <div
          className={`fixed inset-y-0 right-0 z-50 w-72 bg-msf-darker border-l border-msf-border transform transition-transform ${
            moreDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-4 border-b border-msf-border">
              <span className="text-lg font-semibold text-white">More</span>
              <button
                onClick={() => setMoreDrawerOpen(false)}
                className="p-2 text-gray-400 active:text-white touch-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
              {moreNavItems.map((item) => {
                const isActive = location.pathname === item.path
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMoreNavClick(item.path)}
                    className={`flex items-center gap-3 w-full px-4 py-4 rounded-lg transition-colors touch-list-item ${
                      isActive
                        ? 'bg-msf-accent text-white'
                        : 'text-gray-400 active:bg-msf-card active:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                )
              })}

              <div className="pt-4 border-t border-msf-border mt-4">
                <button
                  onClick={() => handleMoreNavClick('/settings')}
                  className="flex items-center gap-3 w-full px-4 py-4 rounded-lg text-gray-400 active:bg-msf-card active:text-white transition-colors touch-list-item"
                >
                  <Server className="w-5 h-5" />
                  <span>Server Settings</span>
                </button>
              </div>
            </nav>

            <div className="px-4 py-4 border-t border-msf-border safe-area-bottom">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-msf-accent flex items-center justify-center">
                    <span className="text-white font-medium text-lg">
                      {user?.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-gray-300">{user?.username}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-3 text-gray-400 active:text-white transition-colors touch-btn"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-msf-darker border-r border-msf-border transform transition-transform lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isNative ? 'hidden' : ''}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-msf-border">
            <Shield className="w-8 h-8 text-msf-accent" />
            <span className="text-xl font-bold text-white">MSF GUI</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-msf-accent text-white'
                      : 'text-gray-400 hover:bg-msf-card hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="px-4 py-4 border-t border-msf-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-msf-accent flex items-center justify-center">
                  <span className="text-white font-medium">
                    {user?.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-gray-300">{user?.username}</span>
              </div>
              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className={`flex items-center justify-between px-4 py-3 bg-msf-darker border-b border-msf-border ${isNative ? 'safe-area-top' : ''}`}>
          {/* Mobile menu button (web only) */}
          {!isNative && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-400 hover:text-white"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}

          {/* Logo */}
          <div className={`flex items-center gap-2 ${isNative ? '' : 'lg:hidden'}`}>
            <Shield className="w-6 h-6 text-msf-accent" />
            <span className="font-bold text-white">MSF GUI</span>
          </div>

          {/* Desktop spacer */}
          {!isNative && <div className="hidden lg:block" />}

          {/* Right side - Notifications */}
          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 overflow-auto p-4 lg:p-6 ${isNative ? 'pb-20' : ''}`}>
          {children}
        </main>
      </div>

      {/* Bottom Navigation (native only) */}
      {isNative && <BottomNav onMoreClick={() => setMoreDrawerOpen(true)} />}
    </div>
  )
}

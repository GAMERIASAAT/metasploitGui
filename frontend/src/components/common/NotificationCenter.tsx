import { useState, useRef, useEffect } from 'react'
import { useNotificationStore } from '../../store/notificationStore'
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Trash2,
  CheckCheck,
  X,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings,
} from 'lucide-react'

const ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
}

const ICON_COLORS = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    notifications,
    unreadCount,
    desktopEnabled,
    soundEnabled,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification,
    setDesktopEnabled,
    setSoundEnabled,
    requestDesktopPermission,
  } = useNotificationStore()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDesktopToggle = async () => {
    if (!desktopEnabled) {
      await requestDesktopPermission()
    } else {
      setDesktopEnabled(false)
    }
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-msf-red text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-msf-card border border-msf-border rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-msf-border">
            <h3 className="font-semibold text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-msf-dark rounded transition-colors"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={markAllAsRead}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-msf-dark rounded transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                onClick={clearAll}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-msf-dark rounded transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="p-4 border-b border-msf-border bg-msf-dark/50">
              <div className="space-y-3">
                <button
                  onClick={handleDesktopToggle}
                  className="flex items-center justify-between w-full p-2 rounded hover:bg-msf-dark transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm text-gray-300">
                    {desktopEnabled ? (
                      <Bell className="w-4 h-4 text-green-400" />
                    ) : (
                      <BellOff className="w-4 h-4 text-gray-500" />
                    )}
                    Desktop notifications
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      desktopEnabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {desktopEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="flex items-center justify-between w-full p-2 rounded hover:bg-msf-dark transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm text-gray-300">
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-gray-500" />
                    )}
                    Sound notifications
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      soundEnabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {soundEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Notifications list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = ICONS[notification.type]
                return (
                  <div
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={`flex items-start gap-3 p-4 border-b border-msf-border last:border-b-0 cursor-pointer transition-colors ${
                      notification.read
                        ? 'bg-transparent hover:bg-msf-dark/50'
                        : 'bg-msf-blue/5 hover:bg-msf-blue/10'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${ICON_COLORS[notification.type]}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`font-medium ${
                            notification.read ? 'text-gray-300' : 'text-white'
                          }`}
                        >
                          {notification.title}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeNotification(notification.id)
                          }}
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTime(notification.timestamp)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 rounded-full bg-msf-blue flex-shrink-0 mt-2" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

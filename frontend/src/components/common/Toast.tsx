import { useNotificationStore, Notification } from '../../store/notificationStore'
import {
  X,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

const ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
}

const COLORS = {
  info: 'bg-blue-500/20 border-blue-500 text-blue-400',
  success: 'bg-green-500/20 border-green-500 text-green-400',
  warning: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
  error: 'bg-red-500/20 border-red-500 text-red-400',
}

const ICON_COLORS = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
}

function ToastItem({ notification }: { notification: Notification }) {
  const { removeNotification } = useNotificationStore()
  const Icon = ICONS[notification.type]

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border ${COLORS[notification.type]} animate-slide-in shadow-lg backdrop-blur-sm`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${ICON_COLORS[notification.type]}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{notification.title}</p>
        <p className="text-sm text-gray-300 mt-0.5">{notification.message}</p>
      </div>
      <button
        onClick={() => removeNotification(notification.id)}
        className="text-gray-400 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function Toast() {
  const { notifications } = useNotificationStore()

  // Show only the 5 most recent non-persistent notifications
  const visibleNotifications = notifications
    .filter((n) => !n.persistent || !n.read)
    .slice(0, 5)

  if (visibleNotifications.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)]">
      {visibleNotifications.map((notification) => (
        <ToastItem key={notification.id} notification={notification} />
      ))}
    </div>
  )
}

import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: Date
  read: boolean
  persistent?: boolean // If true, won't auto-dismiss
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  desktopEnabled: boolean
  soundEnabled: boolean

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  removeNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  setDesktopEnabled: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  requestDesktopPermission: () => Promise<boolean>
}

// Sound for notifications
const playNotificationSound = () => {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleAslX3K7xq9oGgpDjMjasng+DAxwnrzItWoOCS6Z0tyfgDEQJYji3bJ5MQQMhb/RpYhTFxE3qOTlom0dCFqV2ditfCcJQYXN2raDPhMkhNzfs4hFDRqK3+KwhjkOI4na4rCISA0bie/jso1KESZw5eCsjkYIHIvf3rGNTAwYjuXhrYlGDRyM3+G0j04PH4zi4LOOSwwcj+PjsY1IDBqO4+O0kU0QII/l462PSwwaj+TktJFOEB+Q5eSwkE0MHJHl5LSQTREgkeXksJBNDByR5eS0kU4RIJHl5K+QTQwckeXktJFOESCR5eSvkE0MHJHl5LSRThEgkeXksJBNDByR5eS0kU4RIJHl5K+QTQwckeXks5FOESGR5eSwkE0MHJDl5LSRThEhkOXkr5BNDB2Q5eSzkU4RIZDl5K+QTQwdkOXks5FOESCP5eSwkE0MHJC5')
    audio.volume = 0.3
    audio.play().catch(() => {})
  } catch {
    // Ignore audio errors
  }
}

// Desktop notification helper
const showDesktopNotification = (title: string, body: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'msf-gui',
    })
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  desktopEnabled: localStorage.getItem('desktopNotifications') === 'true',
  soundEnabled: localStorage.getItem('soundNotifications') !== 'false', // Default true

  addNotification: (notification) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
      read: false,
    }

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep last 50
      unreadCount: state.unreadCount + 1,
    }))

    // Play sound if enabled
    if (get().soundEnabled) {
      playNotificationSound()
    }

    // Show desktop notification if enabled
    if (get().desktopEnabled) {
      showDesktopNotification(notification.title, notification.message)
    }

    // Auto-remove after 5 seconds if not persistent
    if (!notification.persistent) {
      setTimeout(() => {
        get().removeNotification(id)
      }, 5000)
    }
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: notification && !notification.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      }
    })
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }
      }
      return state
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },

  setDesktopEnabled: (enabled) => {
    localStorage.setItem('desktopNotifications', String(enabled))
    set({ desktopEnabled: enabled })
  },

  setSoundEnabled: (enabled) => {
    localStorage.setItem('soundNotifications', String(enabled))
    set({ soundEnabled: enabled })
  },

  requestDesktopPermission: async () => {
    if (!('Notification' in window)) {
      return false
    }

    if (Notification.permission === 'granted') {
      get().setDesktopEnabled(true)
      return true
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        get().setDesktopEnabled(true)
        return true
      }
    }

    return false
  },
}))

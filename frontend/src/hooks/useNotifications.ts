import { useEffect } from 'react'
import { socketService } from '../services/socket'
import { useNotificationStore } from '../store/notificationStore'
import { Session } from '../types'

/**
 * Hook that listens for session events and triggers notifications
 */
export function useSessionNotifications() {
  const { addNotification } = useNotificationStore()

  useEffect(() => {
    // Notify when new session is opened
    const unsubOpen = socketService.onSessionOpened((data) => {
      const session = data.info as Session | undefined
      const sessionType = session?.type || 'session'
      const target = session?.session_host || session?.tunnel_peer || 'unknown'

      addNotification({
        type: 'success',
        title: 'New Session',
        message: `${sessionType} session opened on ${target}`,
        persistent: true, // Keep this notification visible
      })
    })

    // Notify when session is closed
    const unsubClose = socketService.onSessionClosed((data) => {
      addNotification({
        type: 'warning',
        title: 'Session Closed',
        message: `Session ${data.session_id} has been terminated`,
      })
    })

    return () => {
      unsubOpen()
      unsubClose()
    }
  }, [addNotification])
}

/**
 * Utility functions to trigger notifications from anywhere
 */
export const notify = {
  success: (title: string, message: string, persistent = false) => {
    useNotificationStore.getState().addNotification({
      type: 'success',
      title,
      message,
      persistent,
    })
  },

  error: (title: string, message: string, persistent = false) => {
    useNotificationStore.getState().addNotification({
      type: 'error',
      title,
      message,
      persistent,
    })
  },

  warning: (title: string, message: string, persistent = false) => {
    useNotificationStore.getState().addNotification({
      type: 'warning',
      title,
      message,
      persistent,
    })
  },

  info: (title: string, message: string, persistent = false) => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      title,
      message,
      persistent,
    })
  },

  // Specific notification helpers
  sessionOpened: (session: Session) => {
    const target = session.session_host || session.tunnel_peer || 'unknown'
    notify.success('New Session', `${session.type} session opened on ${target}`, true)
  },

  sessionClosed: (sessionId: string | number) => {
    notify.warning('Session Closed', `Session ${sessionId} has been terminated`)
  },

  jobCompleted: (jobName: string, success: boolean) => {
    if (success) {
      notify.success('Job Completed', `${jobName} finished successfully`)
    } else {
      notify.error('Job Failed', `${jobName} encountered an error`)
    }
  },

  listenerStarted: (payload: string, port: number) => {
    notify.success('Listener Started', `${payload} listening on port ${port}`)
  },

  listenerStopped: (port: number) => {
    notify.info('Listener Stopped', `Handler on port ${port} has been stopped`)
  },

  scanCompleted: (target: string, hostsFound: number) => {
    notify.success('Scan Complete', `Found ${hostsFound} hosts on ${target}`)
  },

  workflowCompleted: (name: string, success: boolean) => {
    if (success) {
      notify.success('Workflow Complete', `${name} executed successfully`)
    } else {
      notify.error('Workflow Failed', `${name} encountered errors`)
    }
  },

  credentialFound: (username: string, host: string) => {
    notify.success('Credential Found', `${username} on ${host}`)
  },
}

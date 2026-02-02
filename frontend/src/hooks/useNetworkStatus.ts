import { useEffect, useState, useCallback } from 'react'
import { Network, ConnectionStatus } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'

interface NetworkState {
  connected: boolean
  connectionType: string
}

export function useNetworkStatus() {
  const [networkStatus, setNetworkStatus] = useState<NetworkState>({
    connected: true,
    connectionType: 'unknown',
  })

  const checkNetwork = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setNetworkStatus({ connected: navigator.onLine, connectionType: 'unknown' })
      return
    }

    try {
      const status = await Network.getStatus()
      setNetworkStatus({
        connected: status.connected,
        connectionType: status.connectionType,
      })
    } catch (error) {
      console.warn('Failed to get network status:', error)
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkNetwork()

    if (!Capacitor.isNativePlatform()) {
      // Web fallback
      const handleOnline = () => setNetworkStatus({ connected: true, connectionType: 'unknown' })
      const handleOffline = () => setNetworkStatus({ connected: false, connectionType: 'none' })

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }

    // Native listener
    const networkListener = Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      setNetworkStatus({
        connected: status.connected,
        connectionType: status.connectionType,
      })
    })

    return () => {
      networkListener.then(listener => listener.remove())
    }
  }, [checkNetwork])

  return {
    ...networkStatus,
    refresh: checkNetwork,
  }
}

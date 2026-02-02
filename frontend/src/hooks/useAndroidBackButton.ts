import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export function useAndroidBackButton() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const backButtonListener = App.addListener('backButton', ({ canGoBack }) => {
      // If we're at the root/dashboard, minimize the app
      if (location.pathname === '/' || location.pathname === '/login') {
        App.minimizeApp()
        return
      }

      // Otherwise, navigate back
      if (canGoBack) {
        navigate(-1)
      } else {
        // Go to dashboard as fallback
        navigate('/')
      }
    })

    return () => {
      backButtonListener.then(listener => listener.remove())
    }
  }, [navigate, location.pathname])
}

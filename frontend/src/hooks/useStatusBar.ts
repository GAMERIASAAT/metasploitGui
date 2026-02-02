import { useEffect } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

export function useStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const configureStatusBar = async () => {
      try {
        // Set dark style (light icons on dark background)
        await StatusBar.setStyle({ style: Style.Dark })

        // Set background color to match app theme
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#0d1117' })
        }

        // Make status bar overlay content (for immersive look)
        await StatusBar.setOverlaysWebView({ overlay: false })
      } catch (error) {
        console.warn('Failed to configure status bar:', error)
      }
    }

    configureStatusBar()
  }, [])
}

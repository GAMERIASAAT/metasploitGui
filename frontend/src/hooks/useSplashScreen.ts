import { useEffect } from 'react'
import { SplashScreen } from '@capacitor/splash-screen'
import { Capacitor } from '@capacitor/core'

export function useSplashScreen() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    // Hide splash screen after app is ready
    // Small delay to ensure the UI is rendered
    const hideSplash = async () => {
      try {
        await SplashScreen.hide({
          fadeOutDuration: 300
        })
      } catch (error) {
        console.warn('Failed to hide splash screen:', error)
      }
    }

    // Wait a bit for the app to render
    const timer = setTimeout(hideSplash, 500)

    return () => clearTimeout(timer)
  }, [])
}

export async function showSplashScreen() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await SplashScreen.show({
      autoHide: false,
      showDuration: 2000,
    })
  } catch (error) {
    console.warn('Failed to show splash screen:', error)
  }
}

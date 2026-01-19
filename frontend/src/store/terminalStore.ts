import { create } from 'zustand'
import { Session } from '../types'

interface TerminalState {
  // Session terminal that persists across navigation
  activeSessionTerminal: Session | null
  isFullscreen: boolean

  openSessionTerminal: (session: Session) => void
  closeSessionTerminal: () => void
  setFullscreen: (fullscreen: boolean) => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
  activeSessionTerminal: null,
  isFullscreen: false,

  openSessionTerminal: (session) => {
    set({ activeSessionTerminal: session })
  },

  closeSessionTerminal: () => {
    set({ activeSessionTerminal: null, isFullscreen: false })
  },

  setFullscreen: (fullscreen) => {
    set({ isFullscreen: fullscreen })
  },
}))

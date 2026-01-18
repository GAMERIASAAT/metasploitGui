import { create } from 'zustand'
import { Session } from '../types'
import { api } from '../services/api'

interface SessionState {
  sessions: Session[]
  selectedSession: Session | null
  isLoading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  selectSession: (session: Session | null) => void
  killSession: (id: number) => Promise<void>
  updateSessions: (sessions: Record<string, Session>) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  selectedSession: null,
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await api.getSessions()
      set({ sessions: data.sessions, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to fetch sessions', isLoading: false })
    }
  },

  selectSession: (session) => {
    set({ selectedSession: session })
  },

  killSession: async (id) => {
    try {
      await api.killSession(id)
      const { sessions, selectedSession } = get()
      set({
        sessions: sessions.filter((s) => s.id !== id),
        selectedSession: selectedSession?.id === id ? null : selectedSession,
      })
    } catch (error) {
      set({ error: 'Failed to kill session' })
    }
  },

  updateSessions: (sessionsMap) => {
    const sessions = Object.entries(sessionsMap).map(([id, info]) => ({
      ...info,
      id: parseInt(id),
    }))
    set({ sessions })
  },
}))

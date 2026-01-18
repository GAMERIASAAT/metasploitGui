import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../services/api'
import { User } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          await api.login(username, password)
          const user = await api.getCurrentUser()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch (error) {
          set({
            error: 'Invalid username or password',
            isLoading: false,
            isAuthenticated: false,
          })
          throw error
        }
      },

      logout: () => {
        api.clearToken()
        set({ user: null, isAuthenticated: false })
      },

      checkAuth: async () => {
        try {
          const user = await api.getCurrentUser()
          set({ user, isAuthenticated: true })
        } catch {
          set({ user: null, isAuthenticated: false })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated }),
    }
  )
)

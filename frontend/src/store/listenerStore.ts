import { create } from 'zustand'
import { Job } from '../types'
import { api } from '../services/api'

interface ListenerState {
  jobs: Job[]
  isLoading: boolean
  error: string | null
  fetchJobs: () => Promise<void>
  createHandler: (payload: string, lhost: string, lport: number, options?: Record<string, unknown>) => Promise<void>
  killJob: (id: string) => Promise<void>
}

export const useListenerStore = create<ListenerState>((set, get) => ({
  jobs: [],
  isLoading: false,
  error: null,

  fetchJobs: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await api.listJobs()
      set({ jobs: data.jobs, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to fetch jobs', isLoading: false })
    }
  },

  createHandler: async (payload, lhost, lport, options) => {
    set({ isLoading: true, error: null })
    try {
      await api.createHandler(payload, lhost, lport, options)
      await get().fetchJobs()
    } catch (error) {
      set({ error: 'Failed to create handler', isLoading: false })
      throw error
    }
  },

  killJob: async (id) => {
    try {
      await api.killJob(id)
      set({ jobs: get().jobs.filter((j) => j.id !== id) })
    } catch (error) {
      set({ error: 'Failed to kill job' })
    }
  },
}))

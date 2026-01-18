import { create } from 'zustand'
import { Module, ModuleStats } from '../types'
import { api } from '../services/api'

interface ModuleState {
  stats: ModuleStats | null
  modules: string[]
  selectedModule: Module | null
  selectedType: string
  searchQuery: string
  searchResults: Module[]
  isLoading: boolean
  error: string | null
  total: number
  offset: number
  fetchStats: () => Promise<void>
  fetchModules: (type: string, offset?: number, search?: string) => Promise<void>
  searchModules: (query: string, type?: string) => Promise<void>
  selectModule: (type: string, name: string) => Promise<void>
  clearSelection: () => void
  setSearchQuery: (query: string) => void
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  stats: null,
  modules: [],
  selectedModule: null,
  selectedType: 'exploit',
  searchQuery: '',
  searchResults: [],
  isLoading: false,
  error: null,
  total: 0,
  offset: 0,

  fetchStats: async () => {
    try {
      const stats = await api.getModuleStats()
      set({ stats })
    } catch (error) {
      set({ error: 'Failed to fetch module stats' })
    }
  },

  fetchModules: async (type, offset = 0, search) => {
    set({ isLoading: true, error: null, selectedType: type })
    try {
      const data = await api.listModules(type, offset, 100, search)
      set({
        modules: data.modules,
        total: data.total,
        offset,
        isLoading: false,
      })
    } catch (error) {
      set({ error: 'Failed to fetch modules', isLoading: false })
    }
  },

  searchModules: async (query, type) => {
    if (query.length < 2) {
      set({ searchResults: [] })
      return
    }
    set({ isLoading: true })
    try {
      const data = await api.searchModules(query, type)
      set({ searchResults: data.results, isLoading: false })
    } catch (error) {
      set({ error: 'Search failed', isLoading: false })
    }
  },

  selectModule: async (type, name) => {
    set({ isLoading: true })
    try {
      const module = await api.getModuleInfo(type, name)
      set({ selectedModule: { ...module, type }, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to load module info', isLoading: false })
    }
  },

  clearSelection: () => {
    set({ selectedModule: null })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },
}))

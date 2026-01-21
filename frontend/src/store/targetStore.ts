import { create } from 'zustand'
import { Target, TargetCreate, Service, ServiceCreate } from '../types'
import { api } from '../services/api'

interface TargetFilters {
  status?: string
  group?: string
  tag?: string
}

interface TargetState {
  targets: Target[]
  selectedTarget: Target | null
  groups: string[]
  tags: string[]
  filters: TargetFilters
  isLoading: boolean
  error: string | null
  stats: {
    total: number
    by_status: Record<string, number>
    by_os: Record<string, number>
    by_group: Record<string, number>
    total_services: number
  } | null

  // Actions
  fetchTargets: () => Promise<void>
  fetchStats: () => Promise<void>
  createTarget: (target: TargetCreate) => Promise<Target>
  updateTarget: (id: string, update: Partial<TargetCreate>) => Promise<void>
  deleteTarget: (id: string) => Promise<void>
  selectTarget: (target: Target | null) => void
  setFilters: (filters: TargetFilters) => void
  clearFilters: () => void
  importTargets: (targets: TargetCreate[]) => Promise<{ imported: number; skipped: number }>
  bulkUpdateStatus: (ids: string[], status: string) => Promise<void>
  bulkDelete: (ids: string[]) => Promise<void>

  // Service actions
  addService: (targetId: string, service: ServiceCreate) => Promise<Service>
  deleteService: (targetId: string, serviceId: string) => Promise<void>
}

export const useTargetStore = create<TargetState>((set, get) => ({
  targets: [],
  selectedTarget: null,
  groups: [],
  tags: [],
  filters: {},
  isLoading: false,
  error: null,
  stats: null,

  fetchTargets: async () => {
    set({ isLoading: true, error: null })
    try {
      const { filters } = get()
      const data = await api.getTargets(filters)
      set({
        targets: data.targets,
        groups: data.groups,
        tags: data.tags,
        isLoading: false,
      })
    } catch (e) {
      set({ error: 'Failed to fetch targets', isLoading: false })
      console.error('Failed to fetch targets:', e)
    }
  },

  fetchStats: async () => {
    try {
      const stats = await api.getTargetStats()
      set({ stats })
    } catch (e) {
      console.error('Failed to fetch target stats:', e)
    }
  },

  createTarget: async (target: TargetCreate) => {
    set({ isLoading: true, error: null })
    try {
      const newTarget = await api.createTarget(target)
      set((state) => ({
        targets: [newTarget, ...state.targets],
        isLoading: false,
      }))
      get().fetchStats()
      return newTarget
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create target'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  updateTarget: async (id: string, update: Partial<TargetCreate>) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await api.updateTarget(id, update)
      set((state) => ({
        targets: state.targets.map((t) => (t.id === id ? updated : t)),
        selectedTarget: state.selectedTarget?.id === id ? updated : state.selectedTarget,
        isLoading: false,
      }))
      get().fetchStats()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update target'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  deleteTarget: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.deleteTarget(id)
      set((state) => ({
        targets: state.targets.filter((t) => t.id !== id),
        selectedTarget: state.selectedTarget?.id === id ? null : state.selectedTarget,
        isLoading: false,
      }))
      get().fetchStats()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to delete target'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  selectTarget: (target: Target | null) => {
    set({ selectedTarget: target })
  },

  setFilters: (filters: TargetFilters) => {
    set({ filters })
    get().fetchTargets()
  },

  clearFilters: () => {
    set({ filters: {} })
    get().fetchTargets()
  },

  importTargets: async (targets: TargetCreate[]) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.importTargets(targets)
      await get().fetchTargets()
      get().fetchStats()
      set({ isLoading: false })
      return result
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to import targets'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  bulkUpdateStatus: async (ids: string[], status: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.bulkUpdateTargetStatus(ids, status)
      set((state) => ({
        targets: state.targets.map((t) =>
          ids.includes(t.id) ? { ...t, status: status as Target['status'] } : t
        ),
        isLoading: false,
      }))
      get().fetchStats()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update targets'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  bulkDelete: async (ids: string[]) => {
    set({ isLoading: true, error: null })
    try {
      await api.bulkDeleteTargets(ids)
      set((state) => ({
        targets: state.targets.filter((t) => !ids.includes(t.id)),
        selectedTarget: ids.includes(state.selectedTarget?.id || '') ? null : state.selectedTarget,
        isLoading: false,
      }))
      get().fetchStats()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to delete targets'
      set({ error: message, isLoading: false })
      throw e
    }
  },

  addService: async (targetId: string, service: ServiceCreate) => {
    try {
      const newService = await api.addService(targetId, service)
      set((state) => ({
        targets: state.targets.map((t) =>
          t.id === targetId ? { ...t, services: [...t.services, newService] } : t
        ),
        selectedTarget:
          state.selectedTarget?.id === targetId
            ? { ...state.selectedTarget, services: [...state.selectedTarget.services, newService] }
            : state.selectedTarget,
      }))
      return newService
    } catch (e) {
      console.error('Failed to add service:', e)
      throw e
    }
  },

  deleteService: async (targetId: string, serviceId: string) => {
    try {
      await api.deleteService(targetId, serviceId)
      set((state) => ({
        targets: state.targets.map((t) =>
          t.id === targetId ? { ...t, services: t.services.filter((s) => s.id !== serviceId) } : t
        ),
        selectedTarget:
          state.selectedTarget?.id === targetId
            ? {
                ...state.selectedTarget,
                services: state.selectedTarget.services.filter((s) => s.id !== serviceId),
              }
            : state.selectedTarget,
      }))
    } catch (e) {
      console.error('Failed to delete service:', e)
      throw e
    }
  },
}))

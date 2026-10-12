import { create } from 'zustand'
import { loadPrefs, savePrefs, type Preferences } from '../lib/prefs'

export type Route =
  | { name: 'home' }
  | { name: 'record'; intent: 'quick' | 'advanced' }
  | { name: 'processing'; intent: 'quick' | 'advanced' }
  | { name: 'quick' }
  | { name: 'editor' }

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  message: string
}

interface AppState {
  route: Route
  prefs: Preferences
  toasts: Toast[]
  settingsOpen: boolean
  exportOpen: boolean
  navigate(route: Route): void
  setPrefs(patch: Partial<Preferences>): void
  toast(kind: Toast['kind'], message: string): void
  dismissToast(id: number): void
  setSettingsOpen(open: boolean): void
  setExportOpen(open: boolean): void
}

let toastId = 1

export const useApp = create<AppState>((set, get) => ({
  route: { name: 'home' },
  prefs: loadPrefs(),
  toasts: [],
  settingsOpen: false,
  exportOpen: false,
  navigate: (route) => set({ route }),
  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch }
    savePrefs(prefs)
    set({ prefs })
  },
  toast: (kind, message) => {
    const id = toastId++
    set({ toasts: [...get().toasts, { id, kind, message }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}))

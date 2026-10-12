import type { AutoZoomLevel, StylePresetId } from '@shared/project'

/** Per-machine conveniences. Losing them is harmless, so browser storage is fine. */
export interface Preferences {
  style: StylePresetId
  autoZoom: Exclude<AutoZoomLevel, 'off'> | 'off'
  countdown: number
  microphone: boolean
}

const KEY = 'frameflow.prefs.v1'
export const DEFAULT_PREFS: Preferences = { style: 'clean', autoZoom: 'subtle', countdown: 3, microphone: false }

export function loadPrefs(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>
    return {
      style: raw.style === 'minimal' || raw.style === 'colorful' ? raw.style : 'clean',
      autoZoom: raw.autoZoom === 'off' || raw.autoZoom === 'dynamic' ? raw.autoZoom : 'subtle',
      countdown: typeof raw.countdown === 'number' ? Math.max(0, Math.min(10, raw.countdown)) : 3,
      microphone: raw.microphone === true,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage can be unavailable; preferences simply won't persist.
  }
}

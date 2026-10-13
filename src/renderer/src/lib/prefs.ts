import type { CameraFeel, CursorEffect, StyleId } from '@shared/project'

/** Per-machine conveniences. Losing them is harmless, so browser storage is fine. */
export interface Preferences {
  style: StyleId
  camera: CameraFeel
  cursor: CursorEffect
  countdown: number
  microphone: boolean
  systemAudio: boolean
}

const KEY = 'frameflow.prefs.v2'
const LEGACY_KEY = 'frameflow.prefs.v1'
const STYLES: readonly StyleId[] = ['studio', 'editorial', 'aura', 'canvas', 'midnight']
const FEELS: readonly CameraFeel[] = ['still', 'calm', 'follow', 'focus']
const CURSORS: readonly CursorEffect[] = ['natural', 'halo', 'spotlight', 'pulse']
export const DEFAULT_PREFS: Preferences = { style: 'editorial', camera: 'calm', cursor: 'halo', countdown: 3, microphone: false, systemAudio: false }

function pick<T>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback
}

export function loadPrefs(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Preferences> | null
    // Carry over the countdown and microphone choices from 0.1.
    const legacy = raw ? null : (JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '{}') as { countdown?: number; microphone?: boolean })
    const src = raw ?? {}
    const countdown = typeof src.countdown === 'number' ? src.countdown : legacy?.countdown
    return {
      style: pick(src.style, STYLES, DEFAULT_PREFS.style),
      camera: pick(src.camera, FEELS, DEFAULT_PREFS.camera),
      cursor: pick(src.cursor, CURSORS, DEFAULT_PREFS.cursor),
      countdown: typeof countdown === 'number' ? Math.max(0, Math.min(10, countdown)) : DEFAULT_PREFS.countdown,
      microphone: (src.microphone ?? legacy?.microphone) === true,
      systemAudio: src.systemAudio === true,
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

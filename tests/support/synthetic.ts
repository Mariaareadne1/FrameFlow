import type { CursorTrack } from '../../src/shared/project.ts'

export interface ScriptStep {
  /** Time the cursor arrives at the target. */
  t: number
  x: number
  y: number
  click?: boolean
}

/**
 * Builds a deterministic cursor track that travels between scripted targets with an
 * ease-in-out motion (like a human), sampled at `rate` Hz, clicking where requested.
 */
export function scriptedTrack(steps: readonly ScriptStep[], duration: number, rate = 60): CursorTrack {
  const samples: CursorTrack['samples'] = []
  const clicks: CursorTrack['clicks'] = []
  const travel = 0.5
  const pos = (t: number) => {
    let prev = steps[0]!
    for (const s of steps) {
      if (t < s.t - travel) return { x: prev.x, y: prev.y }
      if (t < s.t) {
        const k = (t - (s.t - travel)) / travel
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        return { x: prev.x + (s.x - prev.x) * e, y: prev.y + (s.y - prev.y) * e }
      }
      prev = s
    }
    return { x: prev.x, y: prev.y }
  }
  for (let i = 0; i <= Math.round(duration * rate); i++) {
    const t = i / rate
    samples.push({ t, ...pos(t) })
  }
  for (const s of steps) if (s.click) clicks.push({ t: s.t + 0.15, x: s.x, y: s.y, button: 'left' })
  return { version: 1, samples, clicks }
}

/** A 30 second "demo": open a menu, fill a form, press a button far away, then idle. */
export const DEMO_SCRIPT: ScriptStep[] = [
  { t: 0, x: 0.5, y: 0.5 },
  { t: 3, x: 0.12, y: 0.08, click: true },
  { t: 4.2, x: 0.14, y: 0.2, click: true },
  { t: 9, x: 0.6, y: 0.4, click: true },
  { t: 10.5, x: 0.6, y: 0.48, click: true },
  { t: 12, x: 0.62, y: 0.56, click: true },
  { t: 19, x: 0.9, y: 0.9, click: true },
  { t: 26, x: 0.4, y: 0.7 },
]

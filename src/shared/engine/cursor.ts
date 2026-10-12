import type { CursorSample, CursorTrack, Point } from '../project'
import { clamp } from './timeline'

/** Rate at which smoothed paths are precomputed. Lookups interpolate between entries. */
export const PATH_RATE = 120

/**
 * A precomputed, deterministic path: position at time t is a pure function of t.
 * This is what keeps preview, seeking and export identical — no per-frame state.
 */
export interface SmoothPath {
  rate: number
  xs: Float32Array
  ys: Float32Array
}

/** Linear interpolation of raw samples at time t (binary search). */
export function sampleRaw(samples: readonly CursorSample[], t: number): Point | null {
  const n = samples.length
  if (n === 0) return null
  const first = samples[0]!
  const last = samples[n - 1]!
  if (t <= first.t) return { x: first.x, y: first.y }
  if (t >= last.t) return { x: last.x, y: last.y }
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = samples[lo]!
  const b = samples[hi]!
  const span = b.t - a.t
  const k = span > 0 ? (t - a.t) / span : 0
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

/**
 * Critically damped smoothing ("smooth damp"). Exact for any step size, so it is stable
 * and frame-rate independent. `smoothTime` is roughly the time to reach the target.
 */
function smoothDampStep(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  const omega = 2 / Math.max(1e-4, smoothTime)
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (velocity + omega * change) * dt
  const newVelocity = (velocity - omega * temp) * exp
  const value = target + (change + temp) * exp
  return [value, newVelocity]
}

/**
 * Builds a smoothed path over [0, duration] by running the raw cursor through a
 * critically damped follower. smoothTime 0 reproduces the raw path.
 */
export function buildSmoothPath(samples: readonly CursorSample[], duration: number, smoothTime: number): SmoothPath {
  const count = Math.max(2, Math.ceil(duration * PATH_RATE) + 1)
  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  if (samples.length === 0) {
    xs.fill(0.5)
    ys.fill(0.5)
    return { rate: PATH_RATE, xs, ys }
  }
  const dt = 1 / PATH_RATE
  const start = sampleRaw(samples, 0)!
  let x = start.x
  let y = start.y
  let vx = 0
  let vy = 0
  for (let i = 0; i < count; i++) {
    const target = sampleRaw(samples, i * dt)!
    if (smoothTime <= 0) {
      x = target.x
      y = target.y
    } else if (i > 0) {
      ;[x, vx] = smoothDampStep(x, target.x, vx, smoothTime, dt)
      ;[y, vy] = smoothDampStep(y, target.y, vy, smoothTime, dt)
    }
    xs[i] = x
    ys[i] = y
  }
  return { rate: PATH_RATE, xs, ys }
}

export function pathAt(path: SmoothPath, t: number): Point {
  const f = clamp(t * path.rate, 0, path.xs.length - 1)
  const i = Math.floor(f)
  const j = Math.min(i + 1, path.xs.length - 1)
  const k = f - i
  return {
    x: path.xs[i]! + (path.xs[j]! - path.xs[i]!) * k,
    y: path.ys[i]! + (path.ys[j]! - path.ys[i]!) * k,
  }
}

/** Maps the user-facing 0..1 smoothing control to a smoothing time in seconds. */
export function cursorSmoothTime(smoothing: number): number {
  return clamp(smoothing, 0, 1) * 0.16
}

/** Camera follow is much lazier than the visible cursor so zooms glide rather than chase. */
export const CAMERA_SMOOTH_TIME = 0.45

/** Maps the user-facing 0..1 follow smoothing to seconds. 0.5 → 0.45 s (the 0.1 value). */
export function cameraSmoothTime(followSmoothing: number): number {
  return 0.15 + clamp(followSmoothing, 0, 1) * 0.6
}

/**
 * The path the camera follows. Like `buildSmoothPath`, but with a dead zone: the target only
 * moves once the cursor strays more than `deadzone` from it, and then is dragged along on a
 * leash. Small hand movements therefore never move the camera. deadzone 0 ≡ buildSmoothPath.
 */
export function buildCameraPath(samples: readonly CursorSample[], duration: number, smoothTime: number, deadzone: number): SmoothPath {
  if (deadzone <= 0 || samples.length === 0) return buildSmoothPath(samples, duration, smoothTime)
  const dt = 1 / PATH_RATE
  const count = Math.max(2, Math.ceil(duration * PATH_RATE) + 1)
  const leashed: CursorSample[] = new Array(count)
  const first = sampleRaw(samples, 0)!
  let tx = first.x
  let ty = first.y
  for (let i = 0; i < count; i++) {
    const p = sampleRaw(samples, i * dt)!
    const dx = p.x - tx
    const dy = p.y - ty
    const dist = Math.hypot(dx, dy)
    if (dist > deadzone) {
      const k = (dist - deadzone) / dist
      tx += dx * k
      ty += dy * k
    }
    leashed[i] = { t: i * dt, x: tx, y: ty }
  }
  return buildSmoothPath(leashed, duration, smoothTime)
}

/** Validates and sanitizes untrusted cursor JSON. Returns null if unusable. */
export function parseCursorTrack(raw: unknown): CursorTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { samples?: unknown; clicks?: unknown; version?: unknown }
  if (!Array.isArray(obj.samples)) return null
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const samples: CursorSample[] = []
  for (const s of obj.samples) {
    if (s && typeof s === 'object' && finite(s.t) && finite(s.x) && finite(s.y)) {
      samples.push({ t: Math.max(0, s.t), x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1) })
    }
  }
  samples.sort((a, b) => a.t - b.t)
  const clicks: CursorTrack['clicks'] = []
  if (Array.isArray(obj.clicks)) {
    for (const c of obj.clicks) {
      if (c && typeof c === 'object' && finite(c.t) && finite(c.x) && finite(c.y)) {
        clicks.push({ t: Math.max(0, c.t), x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1), button: c.button === 'right' ? 'right' : 'left' })
      }
    }
    clicks.sort((a, b) => a.t - b.t)
  }
  return { version: finite(obj.version) ? obj.version : 1, samples, clicks }
}

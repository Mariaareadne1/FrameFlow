import type { EasingId, Point, ZoomEvent } from '../project'
import { type SmoothPath, pathAt } from './cursor'
import { clamp } from './timeline'

export const MIN_ZOOM_SCALE = 1
export const MAX_ZOOM_SCALE = 4
export const MIN_ZOOM_DURATION = 0.3
export const DEFAULT_TRANSITION = 0.8

/** CSS-style cubic-bezier(x1, y1, x2, y2) easing (Newton iteration with bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
  const dbx = (t: number) => 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const d = dbx(t)
      if (Math.abs(d) < 1e-6) break
      t -= (bx(t) - x) / d
    }
    if (t < 0 || t > 1 || Math.abs(bx(t) - x) > 1e-5) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 30; i++) {
        t = (lo + hi) / 2
        if (bx(t) < x) lo = t
        else hi = t
      }
    }
    return by(t)
  }
}

const crisp = cubicBezier(0.32, 0, 0.12, 1)

export const EASINGS: Record<EasingId, (x: number) => number> = {
  // Symmetric ease-in-out: calm, cinematic.
  smooth: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  // Quick arrival with a gentle start (zero initial velocity): decisive but never a jump.
  crisp,
  // 0.1 "Snappy": instant start, long settle. Kept so older projects render unchanged.
  snappy: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)) / (1 - Math.pow(2, -10)),
  linear: (x) => x,
}

export function ease(id: EasingId, x: number): number {
  const fn = EASINGS[id] ?? EASINGS.smooth
  return clamp(fn(clamp(x, 0, 1)), 0, 1)
}

/** Effective ramp length for an event: never more than half its length. */
export function rampDuration(z: ZoomEvent): number {
  return Math.max(0.05, Math.min(z.transition, (z.end - z.start) / 2))
}

/** 0..1 zoom strength of a single event at source time t. */
export function zoomWeight(z: ZoomEvent, t: number): number {
  if (t <= z.start || t >= z.end) return 0
  const ramp = rampDuration(z)
  if (t < z.start + ramp) return ease(z.easing, (t - z.start) / ramp)
  if (t > z.end - ramp) return ease(z.easing, (z.end - t) / ramp)
  return 1
}

/**
 * Manual zooms win: an automatic zoom that overlaps any manual zoom is ignored.
 * Returns events sorted by start time.
 */
export function effectiveZooms(zooms: readonly ZoomEvent[]): ZoomEvent[] {
  const manual = zooms.filter((z) => z.origin === 'manual')
  return zooms
    .filter((z) => !z.disabled && z.end - z.start >= MIN_ZOOM_DURATION - 1e-6)
    .filter((z) => z.origin === 'manual' || !manual.some((m) => m.start < z.end && z.start < m.end))
    .slice()
    .sort((a, b) => a.start - b.start)
}

export interface Camera {
  /** Magnification, >= 1. */
  scale: number
  /** Viewport centre in normalized source coordinates. */
  cx: number
  cy: number
}

/** Visible region of the source for a camera, normalized. Always inside [0,1]². */
export interface Viewport {
  x: number
  y: number
  w: number
  h: number
}

/** Keeps the viewport for `scale` entirely inside the frame. */
export function clampCenter(c: number, scale: number): number {
  const half = 0.5 / Math.max(1, scale)
  return clamp(c, half, 1 - half)
}

function focusPoint(z: ZoomEvent, cameraPath: SmoothPath | null, t: number): Point {
  if (z.focus.mode === 'fixed') return { x: z.focus.x, y: z.focus.y }
  if (cameraPath) return pathAt(cameraPath, t)
  return { x: 0.5, y: 0.5 }
}

/** Zooms closer than this (seconds) are chained: the camera pans between them instead of zooming out. */
export const CHAIN_GAP = 0.8
/** Shortest pan between chained zooms, so distant hand-offs never whip across the frame. */
export const MIN_HANDOFF = 0.7

/**
 * Groups sorted zooms into chains of back-to-back events.
 */
export function buildChains(zooms: readonly ZoomEvent[]): ZoomEvent[][] {
  const sorted = zooms.slice().sort((a, b) => a.start - b.start)
  const chains: ZoomEvent[][] = []
  let chainEnd = -Infinity
  for (const z of sorted) {
    const current = chains[chains.length - 1]
    if (current && z.start <= chainEnd + CHAIN_GAP) {
      current.push(z)
      chainEnd = Math.max(chainEnd, z.end)
    } else {
      chains.push([z])
      chainEnd = z.end
    }
  }
  return chains
}

interface Target {
  scale: number
  x: number
  y: number
}

function memberTarget(z: ZoomEvent, cameraPath: SmoothPath | null, t: number): Target {
  const p = focusPoint(z, cameraPath, t)
  return { scale: clamp(z.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE), x: p.x, y: p.y }
}

/** Scale/focus a chain is aiming at, ignoring the overall in/out envelope. */
function chainTarget(chain: readonly ZoomEvent[], cameraPath: SmoothPath | null, t: number): Target {
  let lowerBound = -Infinity
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i]!
    const b = chain[i + 1]!
    // Hand-off window: from when A would start leaving to when B would have fully arrived.
    const h0 = Math.max(lowerBound, Math.min(a.end - rampDuration(a), b.start))
    const h1 = Math.max(h0 + MIN_HANDOFF, Math.max(a.end, b.start + rampDuration(b)))
    if (t < h0) return memberTarget(a, cameraPath, t)
    if (t <= h1) {
      const k = ease(b.easing, (t - h0) / (h1 - h0))
      const ta = memberTarget(a, cameraPath, t)
      const tb = memberTarget(b, cameraPath, t)
      return { scale: ta.scale + (tb.scale - ta.scale) * k, x: ta.x + (tb.x - ta.x) * k, y: ta.y + (tb.y - ta.y) * k }
    }
    lowerBound = h1
  }
  return memberTarget(chain[chain.length - 1]!, cameraPath, t)
}

/** Overall 0..1 envelope of a chain: ramps in with its first zoom, out with its last. */
function chainEnvelope(chain: readonly ZoomEvent[], t: number): number {
  const first = chain[0]!
  const last = chain.reduce((a, b) => (b.end > a.end ? b : a))
  if (t <= first.start || t >= last.end) return 0
  const rin = rampDuration(first)
  const rout = rampDuration(last)
  const fadeIn = t < first.start + rin ? ease(first.easing, (t - first.start) / rin) : 1
  const fadeOut = t > last.end - rout ? ease(last.easing, (last.end - t) / rout) : 1
  return Math.min(fadeIn, fadeOut)
}

/**
 * The camera at source time t. A pure function of its inputs — the same call in the
 * preview, during scrubbing and in the exporter yields the same framing.
 *
 * `zooms` should already be filtered by `effectiveZooms`. Back-to-back zooms are chained
 * so the camera pans from one to the next instead of zooming out and back in.
 */
export function cameraAt(zooms: readonly ZoomEvent[], cameraPath: SmoothPath | null, t: number): Camera {
  for (const chain of buildChains(zooms)) {
    const w = chainEnvelope(chain, t)
    if (w <= 0) continue
    const target = chainTarget(chain, cameraPath, t)
    const scale = 1 + (target.scale - 1) * w
    const cx = 0.5 + (target.x - 0.5) * w
    const cy = 0.5 + (target.y - 0.5) * w
    return { scale, cx: clampCenter(cx, scale), cy: clampCenter(cy, scale) }
  }
  return { scale: 1, cx: 0.5, cy: 0.5 }
}

export function viewportOf(cam: Camera): Viewport {
  const w = 1 / cam.scale
  const h = 1 / cam.scale
  return { x: clamp(cam.cx - w / 2, 0, 1 - w), y: clamp(cam.cy - h / 2, 0, 1 - h), w, h }
}

/** Maps a normalized source point into the viewport's 0..1 space (may fall outside). */
export function projectToViewport(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.w, y: (p.y - vp.y) / vp.h }
}

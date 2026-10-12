import type { AutoZoomLevel, ClickEvent, CursorSample, CursorTrack, ZoomEvent } from '../project'
import { clamp } from './timeline'

/**
 * Automatic zoom generation.
 *
 * 1. Collect "interest points": left clicks, plus dwells (the cursor coming to rest after
 *    travelling somewhere new — usually the user pointing at something).
 * 2. Cluster points that are close in time AND fit together inside one zoomed viewport.
 * 3. Turn each cluster into a zoom that starts a little before the first point and holds
 *    a little after the last one.
 * 4. Merge zooms that would nearly touch, then enforce a per-minute cap so the result never
 *    feels busy.
 *
 * Output is ordinary ZoomEvents with origin 'auto' — fully editable on the timeline.
 */

export interface AutoZoomParams {
  scale: number
  /** Points closer than this (seconds) may share a zoom. */
  clusterGap: number
  /** Seconds before the first point that the zoom begins ramping in. */
  leadIn: number
  /** Seconds the zoom holds after the last point. */
  hold: number
  minDuration: number
  maxDuration: number
  transition: number
  /** Merge zooms separated by less than this many seconds. */
  mergeGap: number
  maxPerMinute: number
  /** Minimum dwell length in seconds for a dwell to count as interest. */
  dwellMin: number
  /** When false, dwells are only used for recordings that contain no clicks. */
  dwellsWithClicks: boolean
  focusMode: 'fixed' | 'cursor'
}

export const AUTO_ZOOM_PARAMS: Record<Exclude<AutoZoomLevel, 'off'>, AutoZoomParams> = {
  subtle: {
    scale: 1.5,
    clusterGap: 2.2,
    leadIn: 0.7,
    hold: 1.6,
    minDuration: 2.6,
    maxDuration: 9,
    transition: 0.9,
    mergeGap: 1.5,
    maxPerMinute: 5,
    dwellMin: 1.4,
    dwellsWithClicks: false,
    focusMode: 'fixed',
  },
  dynamic: {
    scale: 2.0,
    clusterGap: 1.5,
    leadIn: 0.5,
    hold: 1.25,
    minDuration: 2.0,
    maxDuration: 7,
    transition: 0.7,
    mergeGap: 1.0,
    maxPerMinute: 9,
    dwellMin: 0.7,
    dwellsWithClicks: true,
    focusMode: 'cursor',
  },
}

/** A point is "at rest" while it stays within this normalized radius. */
const DWELL_RADIUS = 0.015
/** A new dwell only counts if the cursor travelled at least this far from the previous one. */
const DWELL_MIN_TRAVEL = 0.06
/** Fraction of the zoomed viewport a cluster may occupy, leaving breathing room. */
const VIEWPORT_FILL = 0.75

export interface InterestPoint {
  t: number
  x: number
  y: number
  weight: number
}

export function detectDwells(samples: readonly CursorSample[], minDuration: number): InterestPoint[] {
  const points: InterestPoint[] = []
  if (samples.length < 2) return points
  let anchor = samples[0]!
  // Resting where the recording started is not interesting; require travel first.
  let lastDwell: { x: number; y: number } = { x: anchor.x, y: anchor.y }
  let emitted = false
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!
    if (Math.hypot(s.x - anchor.x, s.y - anchor.y) > DWELL_RADIUS) {
      anchor = s
      emitted = false
      continue
    }
    if (!emitted && s.t - anchor.t >= minDuration) {
      const travelled = Math.hypot(anchor.x - lastDwell.x, anchor.y - lastDwell.y) >= DWELL_MIN_TRAVEL
      if (travelled) {
        points.push({ t: anchor.t, x: anchor.x, y: anchor.y, weight: 0.6 })
        lastDwell = { x: anchor.x, y: anchor.y }
      }
      emitted = true
    }
  }
  return points
}

export function collectInterestPoints(track: CursorTrack, params: AutoZoomParams): InterestPoint[] {
  const clicks = track.clicks
    .filter((c: ClickEvent) => c.button === 'left')
    .map((c) => ({ t: c.t, x: c.x, y: c.y, weight: 1 }))
  const dwells = clicks.length > 0 && !params.dwellsWithClicks ? [] : detectDwells(track.samples, params.dwellMin)
  // A dwell right next to a click describes the same moment; keep the click.
  const extraDwells = dwells.filter((d) => !clicks.some((c) => Math.abs(c.t - d.t) < 1.0))
  return [...clicks, ...extraDwells].sort((a, b) => a.t - b.t)
}

interface Cluster {
  points: InterestPoint[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function fits(c: Cluster, p: InterestPoint, scale: number): boolean {
  const extent = VIEWPORT_FILL / scale
  return Math.max(c.maxX, p.x) - Math.min(c.minX, p.x) <= extent && Math.max(c.maxY, p.y) - Math.min(c.minY, p.y) <= extent
}

export function clusterPoints(points: readonly InterestPoint[], params: AutoZoomParams): Cluster[] {
  const clusters: Cluster[] = []
  let current: Cluster | null = null
  for (const p of points) {
    const last: InterestPoint | undefined = current?.points[current.points.length - 1]
    const first: InterestPoint | undefined = current?.points[0]
    if (
      current &&
      last &&
      first &&
      p.t - last.t <= params.clusterGap &&
      p.t - first.t <= params.maxDuration - params.leadIn - params.hold &&
      fits(current, p, params.scale)
    ) {
      current = {
        points: [...current.points, p],
        minX: Math.min(current.minX, p.x),
        maxX: Math.max(current.maxX, p.x),
        minY: Math.min(current.minY, p.y),
        maxY: Math.max(current.maxY, p.y),
      }
      clusters[clusters.length - 1] = current
    } else {
      current = { points: [p], minX: p.x, maxX: p.x, minY: p.y, maxY: p.y }
      clusters.push(current)
    }
  }
  return clusters
}

interface Draft {
  start: number
  end: number
  cx: number
  cy: number
  weight: number
  spanX: number
  spanY: number
}

function clusterToDraft(c: Cluster, params: AutoZoomParams, duration: number): Draft {
  const first = c.points[0]!
  const last = c.points[c.points.length - 1]!
  let start = first.t - params.leadIn
  let end = last.t + params.hold
  if (end - start < params.minDuration) end = start + params.minDuration
  if (end > duration) {
    start -= end - duration
    end = duration
  }
  start = Math.max(0, start)
  return {
    start,
    end,
    cx: (c.minX + c.maxX) / 2,
    cy: (c.minY + c.maxY) / 2,
    weight: c.points.reduce((s, p) => s + p.weight, 0),
    spanX: c.maxX - c.minX,
    spanY: c.maxY - c.minY,
  }
}

function mergeDrafts(drafts: readonly Draft[], params: AutoZoomParams): Draft[] {
  const merged: Draft[] = []
  for (const d of drafts) {
    const prev = merged[merged.length - 1]
    if (prev && d.start - prev.end < params.mergeGap && d.end - prev.start <= params.maxDuration * 1.5) {
      const minX = Math.min(prev.cx - prev.spanX / 2, d.cx - d.spanX / 2)
      const maxX = Math.max(prev.cx + prev.spanX / 2, d.cx + d.spanX / 2)
      const minY = Math.min(prev.cy - prev.spanY / 2, d.cy - d.spanY / 2)
      const maxY = Math.max(prev.cy + prev.spanY / 2, d.cy + d.spanY / 2)
      merged[merged.length - 1] = {
        start: prev.start,
        end: Math.max(prev.end, d.end),
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        weight: prev.weight + d.weight,
        spanX: maxX - minX,
        spanY: maxY - minY,
      }
    } else {
      merged.push(d)
    }
  }
  return merged
}

/** Keeps at most `maxPerMinute` zoom starts in any 60 s window, preferring the strongest. */
function capFrequency(drafts: readonly Draft[], maxPerMinute: number): Draft[] {
  const byStrength = drafts.slice().sort((a, b) => b.weight - a.weight || a.start - b.start)
  const kept: Draft[] = []
  const countIn = (from: number) => kept.filter((k) => k.start >= from && k.start < from + 60).length
  for (const d of byStrength) {
    // Every 60 s window containing d can be slid so it starts at d or at a kept start before d.
    const windowStarts = [d.start, ...kept.filter((k) => k.start <= d.start && k.start > d.start - 60).map((k) => k.start)]
    if (windowStarts.every((w) => countIn(w) + 1 <= maxPerMinute)) kept.push(d)
  }
  return kept.sort((a, b) => a.start - b.start)
}

export function generateAutoZooms(track: CursorTrack | null, duration: number, level: AutoZoomLevel): ZoomEvent[] {
  if (level === 'off' || !track || duration <= 0) return []
  const params = AUTO_ZOOM_PARAMS[level]
  const points = collectInterestPoints(track, params).filter((p) => p.t >= 0 && p.t <= duration)
  const drafts = clusterPoints(points, params).map((c) => clusterToDraft(c, params, duration))
  const merged = mergeDrafts(drafts, params)
  const capped = capFrequency(merged, params.maxPerMinute)

  return capped
    .filter((d) => d.end - d.start >= Math.min(params.minDuration, duration) * 0.5)
    .map((d, i) => {
      // A merged cluster may be too wide for the target scale; back off so it still fits.
      const span = Math.max(d.spanX, d.spanY, 1e-6)
      const scale = clamp(Math.min(params.scale, VIEWPORT_FILL / span), 1.25, params.scale)
      const focusFollows = params.focusMode === 'cursor' || span * scale > VIEWPORT_FILL
      return {
        id: `auto-${i}-${Math.round(d.start * 1000)}`,
        start: round3(d.start),
        end: round3(d.end),
        scale: round3(scale),
        focus: focusFollows ? { mode: 'cursor' as const } : { mode: 'fixed' as const, x: round3(d.cx), y: round3(d.cy) },
        easing: 'smooth' as const,
        transition: params.transition,
        origin: 'auto' as const,
      }
    })
}

/** Replaces the automatic zooms of a list, keeping manual ones untouched. */
export function regenerateAutoZooms(
  zooms: readonly ZoomEvent[],
  track: CursorTrack | null,
  duration: number,
  level: AutoZoomLevel,
): ZoomEvent[] {
  const manual = zooms.filter((z) => z.origin === 'manual')
  return [...manual, ...generateAutoZooms(track, duration, level)].sort((a, b) => a.start - b.start)
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

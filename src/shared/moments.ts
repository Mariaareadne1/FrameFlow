import type { ClickEvent, TrimRange, ZoomEvent } from './project'
import { rampDuration } from './engine/camera'
import { keptSegments, sourceToOutput } from './engine/timeline'

/**
 * Moments are the editing-friendly face of `ZoomEvent`s. Nothing here is stored separately:
 * every value is derived from the project's zooms, trims and recorded clicks, so the
 * Moments strip, the timeline, the preview and the exporter can never disagree.
 */
export interface MomentView {
  id: string
  /** 1-based position in time order. */
  index: number
  title: string
  /** Honest description from telemetry: "Click at 0:08" or "Focus at 0:17". */
  subtitle: string
  /** Source time when the camera is fully on this Moment (thumbnail and seek target). */
  focusTime: number
  /** Output-timeline span that remains visible after cuts (equal values when fully cut). */
  outStart: number
  outEnd: number
  /** Fraction of the Moment that survives cuts. */
  visible: number
  status: 'active' | 'disabled' | 'cut'
  treatment: string
  origin: ZoomEvent['origin']
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function defaultMomentTitle(index: number): string {
  return `Moment ${String(index).padStart(2, '0')}`
}

function visibleSpan(z: ZoomEvent, trims: readonly TrimRange[], duration: number): { from: number; to: number; length: number } | null {
  let length = 0
  let from = Infinity
  let to = -Infinity
  for (const seg of keptSegments(trims, duration)) {
    const a = Math.max(seg.start, z.start)
    const b = Math.min(seg.end, z.end)
    if (b > a) {
      length += b - a
      from = Math.min(from, a)
      to = Math.max(to, b)
    }
  }
  return length > 0 ? { from, to, length } : null
}

export function momentViews(zooms: readonly ZoomEvent[], clicks: readonly ClickEvent[], trims: readonly TrimRange[], duration: number): MomentView[] {
  const segments = keptSegments(trims, duration)
  return zooms
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((z, i) => {
      const span = visibleSpan(z, trims, duration)
      const ramp = rampDuration(z)
      // Aim for the fully-zoomed moment, but stay inside the visible part after cuts.
      let focusTime = Math.min(z.end, z.start + ramp)
      if (span && (focusTime < span.from || focusTime > span.to)) focusTime = Math.min(span.to, Math.max(span.from, focusTime))
      const click = clicks.find((c) => c.button === 'left' && c.t >= z.start && c.t <= z.end)
      const subtitle = click ? `Click at ${formatClock(sourceToOutput(segments, click.t))}` : `Focus at ${formatClock(sourceToOutput(segments, focusTime))}`
      const status: MomentView['status'] = !span ? 'cut' : z.disabled ? 'disabled' : 'active'
      const treatment = status === 'cut' ? 'Removed by a cut' : status === 'disabled' ? 'Camera off' : `${z.scale.toFixed(1)}× · ${z.focus.mode === 'cursor' ? 'Follows cursor' : 'Fixed framing'}`
      return {
        id: z.id,
        index: i + 1,
        title: z.label?.trim() || defaultMomentTitle(i + 1),
        subtitle,
        focusTime,
        outStart: span ? sourceToOutput(segments, span.from) : sourceToOutput(segments, z.start),
        outEnd: span ? sourceToOutput(segments, span.to) : sourceToOutput(segments, z.start),
        visible: span ? span.length / Math.max(1e-6, z.end - z.start) : 0,
        status,
        treatment,
        origin: z.origin,
      }
    })
}

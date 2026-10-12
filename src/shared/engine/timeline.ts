import type { TrimRange } from '../project'

/** A kept section of the source, in source seconds. */
export interface Segment {
  start: number
  end: number
}

/** Shortest section we will ever keep or cut; smaller slivers are dropped. */
export const MIN_SEGMENT = 1 / 30

/**
 * Normalizes trim ranges: clamps to [0, duration], drops slivers, sorts and merges overlaps.
 * Returns new objects; inputs are not mutated.
 */
export function normalizeTrims(trims: readonly TrimRange[], duration: number): TrimRange[] {
  const clamped = trims
    .map((t) => ({ ...t, start: clamp(Math.min(t.start, t.end), 0, duration), end: clamp(Math.max(t.start, t.end), 0, duration) }))
    .filter((t) => t.end - t.start >= MIN_SEGMENT)
    .sort((a, b) => a.start - b.start)

  const merged: TrimRange[] = []
  for (const t of clamped) {
    const last = merged[merged.length - 1]
    if (last && t.start <= last.end + MIN_SEGMENT) {
      merged[merged.length - 1] = { ...last, end: Math.max(last.end, t.end) }
    } else {
      merged.push(t)
    }
  }
  return merged
}

/** The parts of the source that survive trimming, in order. */
export function keptSegments(trims: readonly TrimRange[], duration: number): Segment[] {
  const cuts = normalizeTrims(trims, duration)
  const segments: Segment[] = []
  let cursor = 0
  for (const cut of cuts) {
    if (cut.start - cursor >= MIN_SEGMENT) segments.push({ start: cursor, end: cut.start })
    cursor = Math.max(cursor, cut.end)
  }
  if (duration - cursor >= MIN_SEGMENT) segments.push({ start: cursor, end: duration })
  return segments
}

export function outputDuration(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0)
}

/** Maps output (post-trim) time to source time. Clamps to the last kept frame. */
export function outputToSource(segments: readonly Segment[], outputTime: number): number {
  let remaining = Math.max(0, outputTime)
  for (const s of segments) {
    const len = s.end - s.start
    if (remaining < len) return s.start + remaining
    remaining -= len
  }
  const last = segments[segments.length - 1]
  return last ? last.end : 0
}

/**
 * Maps source time to output time. Times inside a cut map to the output time at which
 * the cut happens (the join point).
 */
export function sourceToOutput(segments: readonly Segment[], sourceTime: number): number {
  let acc = 0
  for (const s of segments) {
    if (sourceTime < s.start) return acc
    if (sourceTime <= s.end) return acc + (sourceTime - s.start)
    acc += s.end - s.start
  }
  return acc
}

/**
 * During playback: if `sourceTime` sits inside a cut (or before the first kept segment),
 * returns where playback should jump to. Returns null when the time is playable, and
 * `'end'` when nothing playable remains.
 */
export function playableTime(segments: readonly Segment[], sourceTime: number): number | null | 'end' {
  for (const s of segments) {
    if (sourceTime < s.start - 1e-4) return s.start
    if (sourceTime < s.end - 1e-4) return null
  }
  return 'end'
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

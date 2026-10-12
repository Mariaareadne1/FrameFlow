import { describe, expect, test } from 'vitest'
import { buildSmoothPath, parseCursorTrack, pathAt, sampleRaw } from '@shared/engine/cursor'

describe('cursor', () => {
  const samples = [
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 1, y: 0.5 },
  ]
  test('raw sampling interpolates and clamps', () => {
    expect(sampleRaw(samples, 0.5)).toEqual({ x: 0.5, y: 0.25 })
    expect(sampleRaw(samples, -1)).toEqual({ x: 0, y: 0 })
    expect(sampleRaw(samples, 5)).toEqual({ x: 1, y: 0.5 })
    expect(sampleRaw([], 1)).toBeNull()
  })

  test('zero smoothing reproduces raw path', () => {
    const p = buildSmoothPath(samples, 1, 0)
    expect(pathAt(p, 0.5).x).toBeCloseTo(0.5, 4)
  })

  test('smoothing lags behind then converges, without overshoot', () => {
    const step = [
      { t: 0, x: 0, y: 0 },
      { t: 0.999, x: 0, y: 0 },
      { t: 1, x: 1, y: 1 },
      { t: 3, x: 1, y: 1 },
    ]
    const p = buildSmoothPath(step, 3, 0.15)
    expect(pathAt(p, 1.05).x).toBeLessThan(0.6)
    expect(pathAt(p, 2.5).x).toBeCloseTo(1, 2)
    for (let t = 0; t <= 3; t += 0.01) expect(pathAt(p, t).x).toBeLessThanOrEqual(1.0001)
  })

  test('smoothed path removes jitter', () => {
    const jitter = Array.from({ length: 300 }, (_, i) => ({ t: i / 60, x: 0.5 + (i % 2 ? 0.01 : -0.01), y: 0.5 }))
    const p = buildSmoothPath(jitter, 5, 0.1)
    for (let t = 1; t < 4.9; t += 0.05) expect(Math.abs(pathAt(p, t).x - 0.5)).toBeLessThan(0.004)
  })

  test('parses and sanitizes untrusted JSON', () => {
    const track = parseCursorTrack({
      version: 1,
      samples: [{ t: 1, x: 2, y: -1 }, { t: 0, x: 0.5, y: 0.5 }, { t: 'x' }, null],
      clicks: [{ t: 0.5, x: 0.2, y: 0.2, button: 'left' }, { t: NaN, x: 0, y: 0 }],
    })
    expect(track?.samples).toEqual([{ t: 0, x: 0.5, y: 0.5 }, { t: 1, x: 1, y: 0 }])
    expect(track?.clicks).toHaveLength(1)
    expect(parseCursorTrack('nope')).toBeNull()
  })
})

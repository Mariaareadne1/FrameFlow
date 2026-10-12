import { describe, expect, test } from 'vitest'
import type { ZoomEvent } from '@shared/project'
import { cameraAt, clampCenter, ease, effectiveZooms, viewportOf, zoomWeight } from '@shared/engine/camera'
import { buildSmoothPath } from '@shared/engine/cursor'

const zoom = (p: Partial<ZoomEvent>): ZoomEvent => ({
  id: 'z',
  start: 1,
  end: 5,
  scale: 2,
  focus: { mode: 'fixed', x: 0.5, y: 0.5 },
  easing: 'smooth',
  transition: 1,
  origin: 'manual',
  ...p,
})

describe('easing', () => {
  test.each(['smooth', 'snappy', 'linear'] as const)('%s starts at 0, ends at 1 and is monotonic', (id) => {
    expect(ease(id, 0)).toBeCloseTo(0, 6)
    expect(ease(id, 1)).toBeCloseTo(1, 6)
    let prev = -1
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const v = ease(id, x)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
  })
  test('smooth is symmetric around the midpoint', () => {
    expect(ease('smooth', 0.5)).toBeCloseTo(0.5)
    expect(ease('smooth', 0.25) + ease('smooth', 0.75)).toBeCloseTo(1)
  })
})

describe('zoom weight', () => {
  const z = zoom({})
  test('ramps in, holds, ramps out', () => {
    expect(zoomWeight(z, 0.5)).toBe(0)
    expect(zoomWeight(z, 1.5)).toBeCloseTo(0.5)
    expect(zoomWeight(z, 3)).toBe(1)
    expect(zoomWeight(z, 4.5)).toBeCloseTo(0.5)
    expect(zoomWeight(z, 5.2)).toBe(0)
  })
  test('ramp never exceeds half of a short event', () => {
    const short = zoom({ start: 0, end: 0.6, transition: 2 })
    expect(zoomWeight(short, 0.3)).toBeCloseTo(1)
  })
  test('is continuous (no jumps between consecutive frames)', () => {
    let prev = 0
    for (let t = 0; t < 6; t += 1 / 60) {
      const w = zoomWeight(z, t)
      expect(Math.abs(w - prev)).toBeLessThan(0.06)
      prev = w
    }
  })
})

describe('camera', () => {
  test('identity when no zoom is active', () => {
    expect(cameraAt([zoom({})], null, 0)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 })
  })

  test('focus near a corner is clamped so the viewport stays in frame', () => {
    const cam = cameraAt([zoom({ focus: { mode: 'fixed', x: 0.98, y: 0.02 } })], null, 3)
    expect(cam.scale).toBeCloseTo(2)
    const vp = viewportOf(cam)
    expect(vp.x).toBeGreaterThanOrEqual(0)
    expect(vp.y).toBeGreaterThanOrEqual(0)
    expect(vp.x + vp.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(vp.y + vp.h).toBeLessThanOrEqual(1 + 1e-9)
    expect(cam.cx).toBeCloseTo(0.75)
    expect(cam.cy).toBeCloseTo(0.25)
  })

  test('viewport stays legal for every frame of a sweep of focus points and scales', () => {
    for (const fx of [0, 0.1, 0.5, 0.9, 1]) {
      for (const scale of [1.2, 2, 4]) {
        const zs = [zoom({ scale, focus: { mode: 'fixed', x: fx, y: 1 - fx } })]
        for (let t = 0; t < 6; t += 0.05) {
          const vp = viewportOf(cameraAt(zs, null, t))
          expect(vp.x).toBeGreaterThanOrEqual(-1e-9)
          expect(vp.y).toBeGreaterThanOrEqual(-1e-9)
          expect(vp.x + vp.w).toBeLessThanOrEqual(1 + 1e-9)
          expect(vp.y + vp.h).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })

  test('cursor focus follows the smoothed camera path', () => {
    const samples = Array.from({ length: 601 }, (_, i) => ({ t: i / 60, x: 0.8, y: 0.3 }))
    const path = buildSmoothPath(samples, 10, 0.45)
    const cam = cameraAt([zoom({ focus: { mode: 'cursor' } })], path, 3)
    expect(cam.cx).toBeCloseTo(0.75, 2) // clamped from 0.8 at scale 2
    expect(cam.cy).toBeCloseTo(0.3, 2)
  })

  test('camera motion between frames is smooth', () => {
    const zs = [zoom({ focus: { mode: 'fixed', x: 0.2, y: 0.8 } })]
    let prev = cameraAt(zs, null, 0)
    for (let t = 1 / 60; t < 6; t += 1 / 60) {
      const cam = cameraAt(zs, null, t)
      expect(Math.abs(cam.scale - prev.scale)).toBeLessThan(0.05)
      expect(Math.abs(cam.cx - prev.cx)).toBeLessThan(0.02)
      prev = cam
    }
  })

  test('back-to-back zooms pan instead of bouncing out', () => {
    const a = zoom({ id: 'a', start: 0, end: 3, focus: { mode: 'fixed', x: 0.2, y: 0.5 } })
    const b = zoom({ id: 'b', start: 2.4, end: 6, focus: { mode: 'fixed', x: 0.8, y: 0.5 } })
    const mid = cameraAt([a, b], null, 2.7)
    expect(mid.scale).toBeGreaterThan(1.4)
  })

  test('manual zooms suppress overlapping automatic zooms', () => {
    const auto = zoom({ id: 'auto', origin: 'auto', start: 0, end: 4 })
    const manual = zoom({ id: 'man', origin: 'manual', start: 3, end: 6 })
    const other = zoom({ id: 'auto2', origin: 'auto', start: 8, end: 10 })
    expect(effectiveZooms([auto, manual, other]).map((z) => z.id)).toEqual(['man', 'auto2'])
  })

  test('clampCenter', () => {
    expect(clampCenter(0, 2)).toBe(0.25)
    expect(clampCenter(1, 4)).toBe(0.875)
    expect(clampCenter(0.3, 1)).toBe(0.5)
  })
})

describe('chained zooms', () => {
  test('pan between back-to-back zooms is continuous and stays zoomed', () => {
    const a = zoom({ id: 'a', start: 0, end: 3, scale: 2, focus: { mode: 'fixed', x: 0.25, y: 0.5 } })
    const b = zoom({ id: 'b', start: 3.3, end: 7, scale: 2.5, focus: { mode: 'fixed', x: 0.75, y: 0.5 } })
    let prev = cameraAt([a, b], null, 0)
    for (let t = 1 / 60; t < 7.2; t += 1 / 60) {
      const cam = cameraAt([a, b], null, t)
      expect(Math.abs(cam.scale - prev.scale)).toBeLessThan(0.08)
      expect(Math.abs(cam.cx - prev.cx)).toBeLessThan(0.03)
      if (t > 1.2 && t < 6) expect(cam.scale).toBeGreaterThanOrEqual(1.99)
      prev = cam
    }
    expect(cameraAt([a, b], null, 1.5).cx).toBeCloseTo(0.25)
    expect(cameraAt([a, b], null, 5).cx).toBeCloseTo(0.75)
  })

  test('distant zooms are independent', () => {
    const a = zoom({ id: 'a', start: 0, end: 2 })
    const b = zoom({ id: 'b', start: 5, end: 7 })
    expect(cameraAt([a, b], null, 3.5).scale).toBe(1)
  })
})

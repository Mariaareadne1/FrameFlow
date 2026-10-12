import { describe, expect, test } from 'vitest'
import { detectDwells, generateAutoZooms, regenerateAutoZooms } from '@shared/engine/autoZoom'
import { cameraAt, effectiveZooms, viewportOf } from '@shared/engine/camera'
import { CAMERA_SMOOTH_TIME, buildSmoothPath } from '@shared/engine/cursor'
import type { ZoomEvent } from '@shared/project'
import { DEMO_SCRIPT, scriptedTrack } from '../support/synthetic'

const track = scriptedTrack(DEMO_SCRIPT, 30)

describe('auto zoom', () => {
  test('off produces nothing', () => {
    expect(generateAutoZooms(track, 30, 'off')).toEqual([])
    expect(generateAutoZooms(null, 30, 'subtle')).toEqual([])
  })

  test('subtle zooms cover each interaction cluster', () => {
    const zooms = generateAutoZooms(track, 30, 'subtle')
    // Three clusters: top-left menu (3–4.2s), the form (9–12s), the far button (19s).
    expect(zooms.length).toBe(3)
    const clickTimes = track.clicks.map((c) => c.t)
    for (const t of clickTimes) expect(zooms.some((z) => z.start < t && t < z.end)).toBe(true)
    for (const z of zooms) {
      expect(z.origin).toBe('auto')
      expect(z.scale).toBeGreaterThan(1)
      expect(z.scale).toBeLessThanOrEqual(1.5)
    }
  })

  test('zoom focus lands on the interaction', () => {
    const zooms = generateAutoZooms(track, 30, 'subtle')
    const form = zooms.find((z) => z.start < 10.6 && z.end > 10.6)!
    expect(form.focus.mode).toBe('fixed')
    if (form.focus.mode === 'fixed') {
      expect(form.focus.x).toBeCloseTo(0.61, 1)
      expect(form.focus.y).toBeCloseTo(0.48, 1)
    }
  })

  test('dynamic is stronger and follows the cursor', () => {
    const zooms = generateAutoZooms(track, 30, 'dynamic')
    expect(zooms.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...zooms.map((z) => z.scale))).toBeGreaterThan(1.5)
    expect(zooms.every((z) => z.focus.mode === 'cursor')).toBe(true)
  })

  test('zooms are never too frequent, too short or overlapping', () => {
    // A user clicking every 0.8s everywhere on screen for two minutes.
    const steps = Array.from({ length: 150 }, (_, i) => ({ t: 1 + i * 0.8, x: (i * 0.37) % 1, y: (i * 0.61) % 1, click: true }))
    const busy = scriptedTrack(steps, 125)
    for (const level of ['subtle', 'dynamic'] as const) {
      const zooms = generateAutoZooms(busy, 125, level)
      for (let i = 0; i < zooms.length; i++) {
        const z = zooms[i]!
        expect(z.end - z.start).toBeGreaterThanOrEqual(1.5)
        const inMinute = zooms.filter((o) => o.start >= z.start && o.start < z.start + 60).length
        expect(inMinute).toBeLessThanOrEqual(level === 'subtle' ? 5 : 9)
        const next = zooms[i + 1]
        if (next) expect(next.start).toBeGreaterThanOrEqual(z.start)
      }
    }
  })

  test('zooms stay within the clip, even for interactions at the very edges', () => {
    const edge = scriptedTrack([{ t: 0, x: 0.5, y: 0.5 }, { t: 0.2, x: 0.99, y: 0.01, click: true }, { t: 3.7, x: 0.01, y: 0.99, click: true }], 4)
    for (const level of ['subtle', 'dynamic'] as const) {
      const zooms = generateAutoZooms(edge, 4, level)
      expect(zooms.length).toBeGreaterThan(0)
      for (const z of zooms) {
        expect(z.start).toBeGreaterThanOrEqual(0)
        expect(z.end).toBeLessThanOrEqual(4)
      }
      const path = buildSmoothPath(edge.samples, 4, CAMERA_SMOOTH_TIME)
      for (let t = 0; t <= 4; t += 1 / 30) {
        const vp = viewportOf(cameraAt(effectiveZooms(zooms), path, t))
        expect(vp.x).toBeGreaterThanOrEqual(-1e-9)
        expect(vp.y).toBeGreaterThanOrEqual(-1e-9)
        expect(vp.x + vp.w).toBeLessThanOrEqual(1 + 1e-9)
        expect(vp.y + vp.h).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  test('very short clip still yields a sensible zoom', () => {
    const short = scriptedTrack([{ t: 0, x: 0.3, y: 0.3, click: true }], 1.2)
    const zooms = generateAutoZooms(short, 1.2, 'subtle')
    for (const z of zooms) {
      expect(z.start).toBeGreaterThanOrEqual(0)
      expect(z.end).toBeLessThanOrEqual(1.2)
    }
  })

  test('is deterministic', () => {
    expect(generateAutoZooms(track, 30, 'dynamic')).toEqual(generateAutoZooms(track, 30, 'dynamic'))
  })

  test('dwells are detected after travel, not while jittering in place', () => {
    const dwells = detectDwells(track.samples, 1.4)
    expect(dwells.length).toBeGreaterThan(0)
    for (const d of dwells) expect(d.x).toBeGreaterThanOrEqual(0)
  })

  test('recordings without clicks still get zooms from dwells', () => {
    const noClicks = { ...track, clicks: [] }
    expect(generateAutoZooms(noClicks, 30, 'subtle').length).toBeGreaterThan(0)
  })

  test('regenerating keeps manual zooms and replaces automatic ones', () => {
    const manual: ZoomEvent = { id: 'm', start: 20, end: 22, scale: 3, focus: { mode: 'cursor' }, easing: 'snappy', transition: 0.5, origin: 'manual' }
    const subtle = regenerateAutoZooms([manual], track, 30, 'subtle')
    expect(subtle.find((z) => z.id === 'm')).toEqual(manual)
    const off = regenerateAutoZooms(subtle, track, 30, 'off')
    expect(off).toEqual([manual])
  })
})

describe('auto zoom across distant interactions', () => {
  test('clicks in different places close in time stay strong separate zooms that chain into pans', () => {
    const steps = [{ t: 0, x: 0.5, y: 0.5 }, ...Array.from({ length: 5 }, (_, i) => ({ t: 1 + i * 2, x: i % 2 ? 0.15 : 0.85, y: i % 2 ? 0.2 : 0.8, click: true }))]
    const tr = scriptedTrack(steps, 12)
    const zooms = generateAutoZooms(tr, 12, 'subtle')
    expect(zooms.length).toBeGreaterThanOrEqual(3)
    for (const z of zooms) expect(z.scale).toBeCloseTo(1.5)
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!.start).toBeGreaterThanOrEqual(zooms[i - 1]!.end - 1e-6)
    // The camera stays zoomed through the sequence rather than bouncing back to 1×.
    const ez = effectiveZooms(zooms)
    for (let t = 2; t < 8; t += 0.1) expect(cameraAt(ez, null, t).scale).toBeGreaterThan(1.3)
  })
})

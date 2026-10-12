import { describe, expect, test } from 'vitest'
import { momentViews } from '@shared/moments'
import { createProject, updateZoom } from '@shared/projectModel'
import type { MediaInfo } from '@shared/project'
import { DEMO_SCRIPT, scriptedTrack } from '../support/synthetic'

const track = scriptedTrack(DEMO_SCRIPT, 30)
const media: MediaInfo = { path: '/a.mp4', width: 1920, height: 1200, duration: 30, hasAudio: false, cursorPath: '/a.json', cursorEmbedded: false }
const project = createProject({ name: 'm', media, cursorTrack: track, camera: 'calm' })

describe('moments', () => {
  test('one Moment per zoom, numbered in time order, with honest click/focus labels', () => {
    const m = momentViews(project.zooms, track.clicks, [], 30)
    expect(m.map((x) => x.id)).toEqual(project.zooms.map((z) => z.id))
    expect(m.map((x) => x.title)).toEqual(['Moment 01', 'Moment 02', 'Moment 03'])
    for (const v of m) expect(v.subtitle).toMatch(/^(Click|Focus) at \d+:\d\d$/)
    expect(m[0]!.subtitle).toBe('Click at 0:03')
  })

  test('user labels are shown; the underlying zoom is the single source of truth', () => {
    const named = updateZoom(project, project.zooms[1]!.id, { label: 'Fill in the form' })
    const m = momentViews(named.zooms, track.clicks, [], 30)
    expect(m[1]!.title).toBe('Fill in the form')
    expect(m[1]!.origin).toBe('manual')
  })

  test('cuts shift output times but never the Moment itself', () => {
    const before = momentViews(project.zooms, track.clicks, [], 30)
    const after = momentViews(project.zooms, track.clicks, [{ id: 't', start: 0, end: 2 }], 30)
    for (let i = 0; i < before.length; i++) {
      expect(after[i]!.focusTime).toBeCloseTo(before[i]!.focusTime)
      expect(after[i]!.outStart).toBeCloseTo(Math.max(0, before[i]!.outStart - 2))
    }
  })

  test('a Moment fully inside a cut is marked cut; a partly cut one shows its visible part', () => {
    const z = project.zooms[1]!
    const fully = momentViews(project.zooms, track.clicks, [{ id: 't', start: z.start - 0.1, end: z.end + 0.1 }], 30)
    expect(fully[1]).toMatchObject({ status: 'cut', visible: 0 })
    const half = (z.start + z.end) / 2
    const partly = momentViews(project.zooms, track.clicks, [{ id: 't', start: half, end: z.end + 1 }], 30)
    expect(partly[1]!.status).toBe('active')
    expect(partly[1]!.visible).toBeCloseTo(0.5, 1)
    expect(partly[1]!.focusTime).toBeLessThanOrEqual(half + 1e-9)
  })

  test('disabled Moments stay listed as camera off', () => {
    const off = updateZoom(project, project.zooms[0]!.id, { disabled: true })
    expect(momentViews(off.zooms, track.clicks, [], 30)[0]).toMatchObject({ status: 'disabled', treatment: 'Camera off' })
  })

  test('imported videos without telemetry have no automatic Moments', () => {
    const imported = createProject({ name: 'i', media: { ...media, cursorPath: null, cursorEmbedded: true }, cursorTrack: null })
    expect(momentViews(imported.zooms, [], [], 30)).toEqual([])
  })
})

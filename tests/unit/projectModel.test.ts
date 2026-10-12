import { describe, expect, test } from 'vitest'
import { addManualZoom, addTrim, updateTrim, applyStyle, createProject, parseProject, ProjectValidationError, removeZoom, setAutoZoom, updateZoom } from '@shared/projectModel'
import type { MediaInfo } from '@shared/project'
import { DEMO_SCRIPT, scriptedTrack } from '../support/synthetic'

const media: MediaInfo = { path: '/tmp/a.mp4', width: 2880, height: 1800, duration: 30, hasAudio: false, cursorPath: '/tmp/a.cursor.json', cursorEmbedded: false }
const track = scriptedTrack(DEMO_SCRIPT, 30)

describe('project model', () => {
  test('new recordings get professional defaults and automatic zooms', () => {
    const p = createProject({ name: 'Demo', media, cursorTrack: track })
    expect(p.autoZoom).toBe('subtle')
    expect(p.zooms.length).toBeGreaterThan(0)
    expect(p.zooms.every((z) => z.origin === 'auto')).toBe(true)
    expect(p.cursor.visible).toBe(true)
    expect(p.frame.padding).toBeGreaterThan(0)
    expect(p.export.resolution).toBe(1080)
  })

  test('imported video without cursor data: no auto zoom, no synthetic cursor', () => {
    const p = createProject({ name: 'Import', media: { ...media, cursorPath: null, cursorEmbedded: true }, cursorTrack: null })
    expect(p.autoZoom).toBe('off')
    expect(p.zooms).toEqual([])
    expect(p.cursor.visible).toBe(false)
    const { project, zoom } = addManualZoom(p, 5, false)
    expect(project.zooms).toHaveLength(1)
    expect(zoom.focus).toEqual({ mode: 'fixed', x: 0.5, y: 0.5 })
  })

  test('styles change look but keep edits', () => {
    const p = createProject({ name: 'Demo', media, cursorTrack: track })
    const c = applyStyle(p, 'colorful')
    expect(c.background).not.toEqual(p.background)
    expect(c.zooms).toEqual(p.zooms)
    expect(c.trims).toEqual(p.trims)
  })

  test('editing an automatic zoom promotes it to manual and survives regeneration', () => {
    const p = createProject({ name: 'Demo', media, cursorTrack: track })
    const target = p.zooms[0]!
    const edited = updateZoom(p, target.id, { scale: 2.5 })
    const z = edited.zooms.find((x) => x.id === target.id)!
    expect(z.scale).toBe(2.5)
    expect(z.origin).toBe('manual')
    const regenerated = setAutoZoom(edited, 'dynamic', track)
    expect(regenerated.zooms.find((x) => x.id === target.id)?.scale).toBe(2.5)
    expect(setAutoZoom(edited, 'off', track).zooms.map((x) => x.id)).toEqual([target.id])
  })

  test('zoom edits are clamped to the clip', () => {
    const p = createProject({ name: 'Demo', media, cursorTrack: null })
    const { project, zoom } = addManualZoom(p, 29.5, false)
    expect(zoom.end).toBeLessThanOrEqual(30)
    const moved = updateZoom(project, zoom.id, { start: -5, end: 100, scale: 9 })
    const z = moved.zooms[0]!
    expect(z.start).toBe(0)
    expect(z.end).toBe(30)
    expect(z.scale).toBe(4)
    expect(removeZoom(moved, zoom.id).zooms).toEqual([])
  })

  test('save/load round trip preserves everything', () => {
    let p = createProject({ name: 'Demo', media, cursorTrack: track, style: 'minimal', aspectRatio: '9:16' })
    p = addTrim(p, 1, 2)
    p = updateZoom(p, p.zooms[0]!.id, { scale: 2.2, focus: { mode: 'fixed', x: 0.3, y: 0.4 } })
    const loaded = parseProject(JSON.parse(JSON.stringify(p)))
    expect(loaded).toEqual(p)
  })

  test('rejects broken files with clear errors and sanitizes values', () => {
    expect(() => parseProject(null)).toThrow(ProjectValidationError)
    expect(() => parseProject({ version: 1 })).toThrow(/video/)
    expect(() => parseProject({ version: 99, media })).toThrow(/newer/)
    const p = parseProject({ version: 1, media, frame: { padding: 5 }, aspectRatio: 'bogus', zooms: [{ start: 1, end: 2, scale: 50 }, 'x'], background: { kind: 'solid', color: 'red;}' } })
    expect(p.frame.padding).toBe(0.3)
    expect(p.aspectRatio).toBe('16:9')
    expect(p.zooms[0]!.scale).toBe(4)
    expect(p.background.kind).toBe('preset')
  })
})

describe('trim editing', () => {
  test('moving a cut start past its end keeps the cut instead of deleting it', () => {
    let p = createProject({ name: 'T', media, cursorTrack: null })
    p = addTrim(p, 0, 2)
    const id = p.trims[0]!.id
    const moved = updateTrim(p, id, { start: 2 })
    expect(moved.trims).toHaveLength(1)
    expect(moved.trims[0]).toMatchObject({ start: 2, end: 4 })
    const ended = updateTrim(moved, id, { end: 1 })
    expect(ended.trims[0]!.end - ended.trims[0]!.start).toBeGreaterThan(0.09)
    expect(updateTrim(p, id, { start: 29.99 }).trims[0]!.end).toBeLessThanOrEqual(30)
  })
})

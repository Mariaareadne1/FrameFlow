import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { AUTO_ZOOM_PARAMS, generateAutoZooms } from '@shared/engine/autoZoom'
import { cameraAt, effectiveZooms } from '@shared/engine/camera'
import { buildCameraPath, buildSmoothPath, cameraSmoothTime, parseCursorTrack, pathAt } from '@shared/engine/cursor'
import { applyStyle, createProject, customizeLook, parseProject, setCameraFeel, setCursorEffect, tuneCamera, updateZoom } from '@shared/projectModel'
import { BACKGROUND_PRESETS, STYLE_PRESETS } from '@shared/styles'
import { PROJECT_FORMAT_VERSION, type CameraFeel, type MediaInfo, type Project } from '@shared/project'
import { DEMO_SCRIPT, scriptedTrack } from '../support/synthetic'

const legacy = (name: string) => JSON.parse(readFileSync(`tests/fixtures/legacy/${name}.frameflow`, 'utf8')) as Record<string, unknown>
const track = scriptedTrack(DEMO_SCRIPT, 30)
const media: MediaInfo = { path: '/tmp/a.mp4', width: 1920, height: 1200, duration: 30, hasAudio: false, cursorPath: '/tmp/a.json', cursorEmbedded: false }

describe('v1 → v2 migration', () => {
  test('recording project: edits, look and camera are preserved exactly', () => {
    const raw = legacy('v1-recording')
    const p = parseProject(raw)
    expect(p.version).toBe(PROJECT_FORMAT_VERSION)
    expect(p.camera.feel).toBe('calm')
    expect(p.camera.deadzone).toBe(0)
    expect(cameraSmoothTime(p.camera.followSmoothing)).toBeCloseTo(0.45)
    expect(p.style).toBe('colorful')
    expect(p.background).toEqual(raw.background)
    expect(p.frame).toEqual(raw.frame)
    expect(p.zooms).toEqual(raw.zooms)
    expect(p.trims).toEqual(raw.trims)
    expect(p.cursor).toMatchObject({ size: 1.8, smoothing: 0.3, clickEffect: true, effect: 'pulse', effectIntensity: 1 })
    expect(p.aspectRatio).toBe('16:9')
    // Save → reload as v2 is stable.
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  test('dynamic project maps to Follow; ripple-off maps to Natural', () => {
    const p = parseProject(legacy('v1-dynamic'))
    expect(p.camera.feel).toBe('follow')
    expect(p.cursor.effect).toBe('natural')
    expect(p.cursor.clickEffect).toBe(false)
    expect(p.zooms).toEqual(legacy('v1-dynamic').zooms)
    expect(p.style).toBe('minimal')
  })

  test('imported project maps to Still and keeps its solid background', () => {
    const p = parseProject(legacy('v1-import'))
    expect(p.camera.feel).toBe('still')
    expect(p.background).toEqual({ kind: 'solid', color: '#2563eb' })
    expect(p.mode).toBe('advanced')
  })

  test('Calm reproduces 0.1 "Subtle" exactly', () => {
    const raw = legacy('v1-recording') as { zooms: Array<{ origin: string; id: string }> }
    const calm = generateAutoZooms(track, 30, 'calm')
    const storedAutos = raw.zooms.filter((z) => z.origin === 'auto')
    for (const z of storedAutos) expect(calm).toContainEqual(z)
  })

  test('newer versions are refused, never reset', () => {
    expect(() => parseProject({ ...legacy('v1-recording'), version: PROJECT_FORMAT_VERSION + 1 })).toThrow(/newer/)
  })
})

function motionProfile(p: Project) {
  const zooms = effectiveZooms(p.zooms)
  const path = buildCameraPath(track.samples, 30, cameraSmoothTime(p.camera.followSmoothing), p.camera.deadzone)
  let sumScale = 0
  let maxScale = 1
  let travel = 0
  let prev = cameraAt(zooms, path, 0)
  for (let t = 0; t <= 30; t += 1 / 30) {
    const c = cameraAt(zooms, path, t)
    sumScale += c.scale
    maxScale = Math.max(maxScale, c.scale)
    travel += Math.hypot(c.cx - prev.cx, c.cy - prev.cy)
    prev = c
  }
  return { meanScale: sumScale / 901, maxScale, travel, count: zooms.length }
}

describe('Camera Feel presets produce genuinely different motion', () => {
  const make = (feel: CameraFeel) => createProject({ name: feel, media, cursorTrack: track, camera: feel })
  const profiles = Object.fromEntries((['still', 'calm', 'follow', 'focus'] as const).map((f) => [f, motionProfile(make(f))]))

  test('Still never moves the camera', () => {
    expect(profiles.still).toMatchObject({ maxScale: 1, travel: 0, count: 0 })
  })
  test('Calm is gentle; Focus is the most emphatic', () => {
    expect(profiles.calm!.maxScale).toBeLessThanOrEqual(1.5 + 1e-9)
    expect(profiles.focus!.maxScale).toBeGreaterThan(profiles.calm!.maxScale + 0.4)
    expect(profiles.focus!.meanScale).toBeGreaterThan(profiles.calm!.meanScale)
  })
  test('Follow tracks the cursor: much more camera travel than the fixed-framing feels', () => {
    expect(profiles.follow!.travel).toBeGreaterThan(profiles.calm!.travel * 1.5)
    expect(make('follow').zooms.every((z) => z.focus.mode === 'cursor')).toBe(true)
    expect(make('focus').zooms.every((z) => z.easing === 'crisp')).toBe(true)
    expect(make('calm').zooms.every((z) => z.easing === 'smooth' && z.transition === AUTO_ZOOM_PARAMS.calm.transition)).toBe(true)
  })
  test('every feel keeps the viewport inside the frame and moves continuously', () => {
    for (const f of ['calm', 'follow', 'focus'] as const) {
      const p = make(f)
      const zooms = effectiveZooms(p.zooms)
      const path = buildCameraPath(track.samples, 30, cameraSmoothTime(0.5), p.camera.deadzone)
      let prev = cameraAt(zooms, path, 0)
      for (let t = 0; t <= 30; t += 1 / 60) {
        const c = cameraAt(zooms, path, t)
        const half = 0.5 / c.scale
        expect(c.cx).toBeGreaterThanOrEqual(half - 1e-9)
        expect(c.cx).toBeLessThanOrEqual(1 - half + 1e-9)
        expect(Math.abs(c.scale - prev.scale)).toBeLessThan(0.12)
        expect(Math.hypot(c.cx - prev.cx, c.cy - prev.cy)).toBeLessThan(0.05)
        prev = c
      }
    }
  })
  test('changing feel or tuning never overwrites edited Moments', () => {
    let p = make('calm')
    const id = p.zooms[0]!.id
    p = updateZoom(p, id, { scale: 3.1, label: 'Sign in' })
    for (const f of ['focus', 'follow', 'still', 'calm'] as const) p = setCameraFeel(p, f, track)
    p = tuneCamera(p, { intensity: 1.5, speed: 0.6 }, track)
    const kept = p.zooms.find((z) => z.id === id)!
    expect(kept).toMatchObject({ scale: 3.1, label: 'Sign in', origin: 'manual' })
  })
  test('intensity and speed reshape automatic Moments', () => {
    const p = make('focus')
    const strong = tuneCamera(p, { intensity: 1.5 }, track)
    const soft = tuneCamera(p, { intensity: 0.5 }, track)
    expect(Math.max(...strong.zooms.map((z) => z.scale))).toBeGreaterThan(Math.max(...soft.zooms.map((z) => z.scale)))
    const slow = tuneCamera(p, { speed: 0.5 }, track)
    expect(slow.zooms[0]!.transition).toBeGreaterThan(p.zooms[0]!.transition)
  })
})

describe('Follow dead zone', () => {
  test('deadzone 0 equals the 0.1 smooth path', () => {
    const a = buildSmoothPath(track.samples, 30, 0.45)
    const b = buildCameraPath(track.samples, 30, 0.45, 0)
    expect(Array.from(b.xs)).toEqual(Array.from(a.xs))
  })
  test('small hand movements inside the dead zone do not move the camera', () => {
    const jitter = Array.from({ length: 600 }, (_, i) => ({ t: i / 60, x: 0.5 + 0.02 * Math.sin(i * 0.1), y: 0.5 + 0.02 * Math.sin(i * 0.13) }))
    const path = buildCameraPath(jitter, 10, 0.45, 0.04)
    const start = pathAt(path, 0)
    for (let t = 0; t < 10; t += 0.1) {
      const p = pathAt(path, t)
      expect(Math.abs(p.x - start.x)).toBeLessThan(0.002)
      expect(Math.abs(p.y - start.y)).toBeLessThan(0.002)
    }
    // Without a dead zone the same jitter leaks into the camera.
    const loose = buildCameraPath(jitter, 10, 0.15, 0)
    let maxDev = 0
    for (let t = 0; t < 10; t += 0.05) maxDev = Math.max(maxDev, Math.abs(pathAt(loose, t).x - start.x))
    expect(maxDev).toBeGreaterThan(0.005)
  })
  test('large movements are still followed', () => {
    const move = [{ t: 0, x: 0.2, y: 0.5 }, { t: 1, x: 0.8, y: 0.5 }, { t: 5, x: 0.8, y: 0.5 }]
    const path = buildCameraPath(move, 5, 0.45, 0.04)
    expect(pathAt(path, 4.5).x).toBeGreaterThan(0.74)
  })
})

describe('styles and cursor treatments', () => {
  test('five art directions with real backdrop presets', () => {
    expect(STYLE_PRESETS.map((s) => s.id).sort()).toEqual(['aura', 'canvas', 'editorial', 'midnight', 'studio'])
    for (const s of STYLE_PRESETS) {
      if (s.background.kind === 'preset') expect(BACKGROUND_PRESETS.some((b) => b.id === (s.background as { presetId: string }).presetId)).toBe(true)
    }
  })
  test('a style changes only backdrop and frame', () => {
    const p = createProject({ name: 'x', media, cursorTrack: track, camera: 'focus', cursorEffect: 'spotlight' })
    const q = applyStyle(p, 'midnight')
    expect(q.camera).toEqual(p.camera)
    expect(q.cursor).toEqual(p.cursor)
    expect(q.zooms).toEqual(p.zooms)
    expect(q.frame.shadowTint).toBe('#5E4E96')
  })
  test('manual look edits mark the style as custom; legacy styles stay named', () => {
    const p = createProject({ name: 'x', media, cursorTrack: null })
    expect(p.style).toBe('editorial')
    expect(customizeLook(p, { frame: { ...p.frame, padding: 0.2 } }).style).toBe('custom')
    const legacyP = parseProject(legacy('v1-recording'))
    expect(customizeLook(legacyP, { frame: { ...legacyP.frame, padding: 0.2 } }).style).toBe('custom')
    expect(legacyP.style).toBe('colorful')
  })
  test('cursor effect keeps the legacy clickEffect flag in sync', () => {
    const p = createProject({ name: 'x', media, cursorTrack: track })
    expect(setCursorEffect(p, 'pulse').cursor.clickEffect).toBe(true)
    expect(setCursorEffect(p, 'halo').cursor.clickEffect).toBe(false)
  })
  test('disabled Moments are kept but produce no camera movement', () => {
    const p = createProject({ name: 'x', media, cursorTrack: track })
    const id = p.zooms[0]!.id
    const q = updateZoom(p, id, { disabled: true })
    expect(q.zooms.find((z) => z.id === id)?.disabled).toBe(true)
    expect(effectiveZooms(q.zooms).some((z) => z.id === id)).toBe(false)
    expect(parseProject(JSON.parse(JSON.stringify(q))).zooms.find((z) => z.id === id)?.disabled).toBe(true)
  })
  test('parseCursorTrack fixture sanity', () => {
    expect(parseCursorTrack(track)?.clicks.length).toBe(DEMO_SCRIPT.filter((s) => s.click).length)
  })
})

describe('regeneration hygiene', () => {
  test('ids stay unique and autos never duplicate an edited Moment', () => {
    let p = createProject({ name: 'x', media, cursorTrack: track, camera: 'calm' })
    const id = p.zooms[1]!.id
    p = updateZoom(p, id, { scale: 2.6 })
    for (const f of ['focus', 'calm', 'follow', 'calm'] as const) {
      p = setCameraFeel(p, f, track)
      const ids = p.zooms.map((z) => z.id)
      expect(new Set(ids).size).toBe(ids.length)
      const edited = p.zooms.find((z) => z.id === id)!
      expect(p.zooms.filter((z) => z.origin === 'auto' && z.start < edited.end && edited.start < z.end)).toEqual([])
    }
  })
})

describe('review fixes', () => {
  test('migrated projects keep the 0.1 pan hand-off; new projects get the longer one', () => {
    expect(parseProject(legacy('v1-recording')).camera.minHandoff).toBe(0.05)
    expect(createProject({ name: 'n', media, cursorTrack: track }).camera.minHandoff).toBe(0.7)
  })
  test('the hand-off setting changes chained pans only where ramps are short', async () => {
    const { cameraAt: cam } = await import('@shared/engine/camera')
    const z = (id: string, start: number, end: number, x: number) => ({ id, start, end, scale: 2, focus: { mode: 'fixed' as const, x, y: 0.5 }, easing: 'smooth' as const, transition: 0.2, origin: 'manual' as const })
    const chain = [z('a', 0, 2, 0.25), z('b', 2.1, 4, 0.75)]
    expect(cam(chain, null, 2.05, 0.05).cx).not.toBeCloseTo(cam(chain, null, 2.05, 0.7).cx, 3)
  })
  test('named or disabled automatic Moments are treated as edits on load', () => {
    const p = createProject({ name: 'x', media, cursorTrack: track })
    const raw = JSON.parse(JSON.stringify(p))
    raw.zooms[0].label = 'Hand named'
    raw.zooms[1].disabled = true
    const q = parseProject(raw)
    expect(q.zooms[0]!.origin).toBe('manual')
    expect(q.zooms[1]!.origin).toBe('manual')
  })
  test('only 3- or 6-digit shadow tints are accepted', () => {
    const p = createProject({ name: 'x', media, cursorTrack: null })
    const bad = parseProject({ ...JSON.parse(JSON.stringify(p)), frame: { ...p.frame, shadowTint: '#12345' } })
    expect(bad.frame.shadowTint).toBeUndefined()
    const ok = parseProject({ ...JSON.parse(JSON.stringify(p)), frame: { ...p.frame, shadowTint: '#abc' } })
    expect(ok.frame.shadowTint).toBe('#abc')
  })
})

describe('sound (format v3)', () => {
  test('v1 and v2 projects migrate to full-volume recording audio and no extra tracks', () => {
    const p = parseProject(legacy('v1-recording'))
    expect(p.version).toBe(3)
    expect(p.sound).toEqual({ mainGain: 1, tracks: [] })
    const v2 = { ...JSON.parse(JSON.stringify(createProject({ name: 'x', media, cursorTrack: track }))), version: 2 }
    delete v2.sound
    expect(parseProject(v2).sound).toEqual({ mainGain: 1, tracks: [] })
  })
  test('a separately recorded microphone becomes a track', () => {
    const p = createProject({ name: 'x', media: { ...media, hasAudio: true }, cursorTrack: track, microphonePath: '/tmp/microphone.m4a' })
    expect(p.sound.tracks).toEqual([expect.objectContaining({ kind: 'microphone', label: 'Microphone', path: '/tmp/microphone.m4a', gain: 1 })])
  })
  test('track operations are clamped and round-trip', async () => {
    const { addSoundTrack, removeSoundTrack, setMainGain, updateSoundTrack } = await import('@shared/projectModel')
    let p = createProject({ name: 'x', media, cursorTrack: null })
    const added = addSoundTrack(p, '/tmp/voice.m4a', 'Voice-over')
    p = updateSoundTrack(added.project, added.track.id, { gain: 9, label: 'VO' })
    p = setMainGain(p, -3)
    expect(p.sound.mainGain).toBe(0)
    expect(p.sound.tracks[0]).toMatchObject({ gain: 2, label: 'VO', kind: 'imported' })
    expect(parseProject(JSON.parse(JSON.stringify(p))).sound).toEqual(p.sound)
    expect(removeSoundTrack(p, added.track.id).sound.tracks).toEqual([])
  })
  test('untrusted sound data is sanitized', () => {
    const p = createProject({ name: 'x', media, cursorTrack: null })
    const raw = { ...JSON.parse(JSON.stringify(p)), sound: { mainGain: 'loud', tracks: [{ path: '' }, { path: '/a.m4a', gain: -1, kind: 'weird' }, 'x'] } }
    const s = parseProject(raw).sound
    expect(s.mainGain).toBe(1)
    expect(s.tracks).toHaveLength(1)
    expect(s.tracks[0]).toMatchObject({ path: '/a.m4a', gain: 0, kind: 'imported' })
  })
})

describe('Moment notes (captions and pointers)', () => {
  test('captions are trimmed, capped and positioned; pointers are clamped; both round-trip', () => {
    let p = createProject({ name: 'x', media, cursorTrack: track })
    const id = p.zooms[0]!.id
    p = updateZoom(p, id, { caption: `  Fill   in the form ${'x'.repeat(200)}`, captionPosition: 'top', pointer: { x: 2, y: -1 } })
    const z = p.zooms.find((q) => q.id === id)!
    expect(z.caption!.startsWith('Fill in the form')).toBe(true)
    expect(z.caption!.length).toBeLessThanOrEqual(120)
    expect(z.captionPosition).toBe('top')
    expect(z.pointer).toEqual({ x: 1, y: 0 })
    expect(parseProject(JSON.parse(JSON.stringify(p))).zooms.find((q) => q.id === id)).toEqual(z)
  })
  test('clearing a caption removes it entirely', () => {
    let p = createProject({ name: 'x', media, cursorTrack: track })
    const id = p.zooms[0]!.id
    p = updateZoom(p, id, { caption: 'Hello' })
    p = updateZoom(p, id, { caption: undefined, pointer: undefined })
    const z = p.zooms.find((q) => q.id === id)!
    expect('caption' in z).toBe(false)
    expect('pointer' in z).toBe(false)
  })
  test('annotated automatic Moments load as edits so feel changes keep them', () => {
    const p = createProject({ name: 'x', media, cursorTrack: track })
    const raw = JSON.parse(JSON.stringify(p))
    raw.zooms[0].caption = 'Kept'
    expect(parseProject(raw).zooms[0]!.origin).toBe('manual')
  })
})

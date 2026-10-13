import {
  PROJECT_FORMAT_VERSION,
  type AspectRatio,
  type Background,
  type CameraFeel,
  type CameraSettings,
  type CursorEffect,
  type CursorStyle,
  type CursorTrack,
  type EasingId,
  type ExportSettings,
  type SoundSettings,
  type SoundTrack,
  type FrameStyle,
  type LegacyAutoZoomLevel,
  type MediaInfo,
  type Project,
  type StylePresetId,
  type TrimRange,
  type ZoomEvent,
  type ZoomFocus,
} from './project'
import { BACKGROUND_PRESETS, DEFAULT_STYLE, LEGACY_STYLE_PRESETS, findStylePreset } from './styles'
import { NEUTRAL_TUNING, regenerateAutoZooms } from './engine/autoZoom'
import { DEFAULT_TRANSITION, LEGACY_HANDOFF, MAX_ZOOM_SCALE, MIN_HANDOFF, MIN_ZOOM_DURATION } from './engine/camera'
import { clamp, normalizeTrims } from './engine/timeline'

export function newId(prefix: string): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${prefix}-${rnd}`
}

/** Shortest cut the editor keeps alive while its edges are being edited. */
export const MIN_TRIM_LENGTH = 0.1

export const DEFAULT_EXPORT: ExportSettings = { resolution: 1080, fps: 60, quality: 'high' }

export interface CreateProjectOptions {
  name: string
  media: MediaInfo
  cursorTrack: CursorTrack | null
  style?: StylePresetId
  camera?: CameraFeel
  cursorEffect?: CursorEffect
  aspectRatio?: AspectRatio
  /** A separately recorded microphone file (when system audio was recorded too). */
  microphonePath?: string | null
  now?: Date
}

export const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'wav', 'aac', 'caf', 'aiff'] as const
export const MAX_SOUND_TRACKS = 8

/** Default follow dead zone for new projects; migrated 0.1 projects use 0 (old behaviour). */
export const DEFAULT_DEADZONE = 0.04

export function defaultCamera(feel: CameraFeel): CameraSettings {
  const tuning = feel === 'still' ? NEUTRAL_TUNING.calm : NEUTRAL_TUNING[feel]
  return { feel, ...tuning, followSmoothing: 0.5, deadzone: DEFAULT_DEADZONE, minHandoff: MIN_HANDOFF }
}

function tuningOf(camera: CameraSettings) {
  return { intensity: camera.intensity, speed: camera.speed, softness: camera.softness }
}

/** Look of a style preset, or of a legacy 0.1 preset when one is requested (tests, migration). */
function lookFor(id: StylePresetId): { background: Background; frame: FrameStyle } {
  const style = findStylePreset(id) ?? LEGACY_STYLE_PRESETS.find((l) => l.id === id) ?? findStylePreset(DEFAULT_STYLE)!
  return { background: style.background, frame: { ...style.frame } }
}

/** Creates a project with professional defaults and automatic Moments already applied. */
export function createProject(opts: CreateProjectOptions): Project {
  const styleId = opts.style ?? DEFAULT_STYLE
  const look = lookFor(styleId)
  const now = (opts.now ?? new Date()).toISOString()
  const feel: CameraFeel = opts.cursorTrack ? (opts.camera ?? 'calm') : 'still'
  const effect = opts.cursorEffect ?? 'halo'
  const camera = defaultCamera(feel)
  const base: Project = {
    version: PROJECT_FORMAT_VERSION,
    id: newId('proj'),
    name: opts.name,
    createdAt: now,
    updatedAt: now,
    mode: 'quick',
    media: opts.media,
    style: styleId,
    aspectRatio: opts.aspectRatio ?? '16:9',
    background: look.background,
    frame: look.frame,
    cursor: {
      visible: !opts.media.cursorEmbedded && !!opts.cursorTrack,
      size: 1.4,
      smoothing: 0.6,
      clickEffect: effect === 'pulse',
      effect,
      effectIntensity: 0.8,
    },
    camera,
    sound: {
      mainGain: 1,
      tracks: opts.microphonePath ? [{ id: newId('sound'), kind: 'microphone', label: 'Microphone', path: opts.microphonePath, gain: 1 }] : [],
    },
    zooms: [],
    trims: [],
    export: { ...DEFAULT_EXPORT },
  }
  return { ...base, zooms: regenerateAutoZooms([], opts.cursorTrack, opts.media.duration, feel, tuningOf(camera)) }
}

/**
 * Applies an art direction: backdrop and frame only. Camera, cursor, Moments and cuts are
 * never touched by a style change.
 */
export function applyStyle(project: Project, id: StylePresetId): Project {
  const look = lookFor(id)
  return { ...project, style: id, background: look.background, frame: look.frame }
}

/** Marks the look as customised (after manual background/frame edits). */
export function customizeLook(project: Project, patch: Partial<Pick<Project, 'background' | 'frame'>>): Project {
  return { ...project, ...patch, style: 'custom' }
}

/**
 * Switches the camera feel. Automatic Moments are regenerated with the feel's neutral tuning;
 * manual and edited Moments are always preserved.
 */
export function setCameraFeel(project: Project, feel: CameraFeel, track: CursorTrack | null): Project {
  const neutral = feel === 'still' ? tuningOf(project.camera) : NEUTRAL_TUNING[feel]
  const camera: CameraSettings = { ...project.camera, feel, ...neutral }
  return { ...project, camera, zooms: regenerateAutoZooms(project.zooms, track, project.media.duration, feel, tuningOf(camera)) }
}

/** Adjusts camera tuning. Changing intensity/speed/softness regenerates automatic Moments. */
export function tuneCamera(project: Project, patch: Partial<Omit<CameraSettings, 'feel'>>, track: CursorTrack | null): Project {
  const camera: CameraSettings = {
    ...project.camera,
    ...patch,
  }
  const clean: CameraSettings = {
    feel: camera.feel,
    intensity: clamp(camera.intensity, 0.5, 1.5),
    speed: clamp(camera.speed, 0.5, 1.5),
    softness: clamp(camera.softness, 0, 1),
    followSmoothing: clamp(camera.followSmoothing, 0, 1),
    deadzone: clamp(camera.deadzone, 0, 0.15),
    minHandoff: clamp(camera.minHandoff, 0, 2),
  }
  const regenerate = patch.intensity !== undefined || patch.speed !== undefined || patch.softness !== undefined
  return {
    ...project,
    camera: clean,
    zooms: regenerate ? regenerateAutoZooms(project.zooms, track, project.media.duration, clean.feel, tuningOf(clean)) : project.zooms,
  }
}

export function setMainGain(project: Project, gain: number): Project {
  return { ...project, sound: { ...project.sound, mainGain: clamp(gain, 0, 2) } }
}

export function addSoundTrack(project: Project, path: string, label: string): { project: Project; track: SoundTrack } {
  if (project.sound.tracks.length >= MAX_SOUND_TRACKS) throw new Error(`A project can have at most ${MAX_SOUND_TRACKS} extra audio tracks.`)
  const track: SoundTrack = { id: newId('sound'), kind: 'imported', label: label.slice(0, 60) || 'Audio', path, gain: 1 }
  return { project: { ...project, sound: { ...project.sound, tracks: [...project.sound.tracks, track] } }, track }
}

export function updateSoundTrack(project: Project, id: string, patch: Partial<Pick<SoundTrack, 'gain' | 'label'>>): Project {
  return {
    ...project,
    sound: {
      ...project.sound,
      tracks: project.sound.tracks.map((t) =>
        t.id === id ? { ...t, ...(patch.gain !== undefined ? { gain: clamp(patch.gain, 0, 2) } : {}), ...(patch.label !== undefined ? { label: patch.label.slice(0, 60) || t.label } : {}) } : t,
      ),
    },
  }
}

export function removeSoundTrack(project: Project, id: string): Project {
  return { ...project, sound: { ...project.sound, tracks: project.sound.tracks.filter((t) => t.id !== id) } }
}

export function setCursorEffect(project: Project, effect: CursorEffect): Project {
  return { ...project, cursor: { ...project.cursor, effect, clickEffect: effect === 'pulse' } }
}

export function sanitizeZoom(z: ZoomEvent, duration: number): ZoomEvent {
  const start = clamp(Math.min(z.start, z.end), 0, Math.max(0, duration - MIN_ZOOM_DURATION))
  const end = clamp(Math.max(z.end, start + MIN_ZOOM_DURATION), start + MIN_ZOOM_DURATION, duration)
  const focus: ZoomFocus = z.focus.mode === 'fixed' ? { mode: 'fixed', x: clamp(z.focus.x, 0, 1), y: clamp(z.focus.y, 0, 1) } : { mode: 'cursor' }
  return { ...z, start, end, scale: clamp(z.scale, 1, MAX_ZOOM_SCALE), transition: clamp(z.transition, 0.05, 3), focus }
}

export function addManualZoom(project: Project, at: number, hasCursor: boolean): { project: Project; zoom: ZoomEvent } {
  const duration = project.media.duration
  const length = Math.min(3, Math.max(MIN_ZOOM_DURATION, duration))
  const start = clamp(at, 0, Math.max(0, duration - length))
  const zoom = sanitizeZoom(
    {
      id: newId('zoom'),
      start,
      end: start + length,
      scale: 1.8,
      focus: hasCursor ? { mode: 'cursor' } : { mode: 'fixed', x: 0.5, y: 0.5 },
      easing: 'smooth',
      transition: DEFAULT_TRANSITION,
      origin: 'manual',
    },
    duration,
  )
  return { project: { ...project, zooms: [...project.zooms, zoom].sort((a, b) => a.start - b.start) }, zoom }
}

/**
 * Updates a zoom. Editing an automatic zoom promotes it to 'manual' so that changing the
 * auto-zoom level later never throws the user's adjustments away.
 */
export function updateZoom(project: Project, id: string, patch: Partial<Omit<ZoomEvent, 'id'>>): Project {
  return {
    ...project,
    zooms: project.zooms
      .map((z) => (z.id === id ? sanitizeZoom({ ...z, ...patch, origin: 'manual' }, project.media.duration) : z))
      .sort((a, b) => a.start - b.start),
  }
}

export function removeZoom(project: Project, id: string): Project {
  return { ...project, zooms: project.zooms.filter((z) => z.id !== id) }
}

export function addTrim(project: Project, start: number, end: number): Project {
  const trims = normalizeTrims([...project.trims, { id: newId('trim'), start, end }], project.media.duration)
  return { ...project, trims }
}

export function updateTrim(project: Project, id: string, patch: Partial<Omit<TrimRange, 'id'>>): Project {
  const duration = project.media.duration
  const trims = normalizeTrims(
    project.trims.map((t) => {
      if (t.id !== id) return t
      const length = Math.max(MIN_TRIM_LENGTH, t.end - t.start)
      let start = clamp(patch.start ?? t.start, 0, duration)
      let end = clamp(patch.end ?? t.end, 0, duration)
      // Moving one edge past the other keeps the cut alive instead of collapsing it.
      if (end - start < MIN_TRIM_LENGTH) {
        if (patch.start !== undefined && patch.end === undefined) end = Math.min(duration, start + length)
        else start = Math.max(0, end - length)
        if (end - start < MIN_TRIM_LENGTH) start = Math.max(0, end - MIN_TRIM_LENGTH)
      }
      return { ...t, start, end }
    }),
    duration,
  )
  return { ...project, trims }
}

export function removeTrim(project: Project, id: string): Project {
  return { ...project, trims: project.trims.filter((t) => t.id !== id) }
}

// ---------------------------------------------------------------------------------------
// Validation of untrusted project JSON (files on disk can be edited or corrupted).
// ---------------------------------------------------------------------------------------

export class ProjectValidationError extends Error {}

const ASPECTS: readonly AspectRatio[] = ['16:9', '9:16', '1:1', '4:3']
const LEGACY_LEVELS: readonly LegacyAutoZoomLevel[] = ['off', 'subtle', 'dynamic']
const STYLES: readonly StylePresetId[] = ['studio', 'editorial', 'aura', 'canvas', 'midnight', 'clean', 'minimal', 'colorful', 'custom']
const FEELS: readonly CameraFeel[] = ['still', 'calm', 'follow', 'focus']
const EFFECTS: readonly CursorEffect[] = ['natural', 'halo', 'spotlight', 'pulse']
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const MAX_EVENTS = 2000

/** 0.1 → 2.0 camera mapping. Stored zooms are kept verbatim, so output is unchanged. */
export const LEGACY_FEEL: Record<LegacyAutoZoomLevel, CameraFeel> = { off: 'still', subtle: 'calm', dynamic: 'follow' }
const EASING_IDS: readonly EasingId[] = ['smooth', 'crisp', 'snappy', 'linear']
const RESOLUTIONS: readonly ExportSettings['resolution'][] = [720, 1080, 1440, 2160]

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const oneOf = <T,>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)

function parseBackground(v: unknown): Background {
  if (isObj(v) && v.kind === 'solid' && typeof v.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.color)) {
    return { kind: 'solid', color: v.color }
  }
  if (isObj(v) && v.kind === 'preset' && typeof v.presetId === 'string' && BACKGROUND_PRESETS.some((p) => p.id === v.presetId)) {
    return { kind: 'preset', presetId: v.presetId }
  }
  return findStylePreset(DEFAULT_STYLE)!.background
}

function parseZoom(v: unknown, duration: number): ZoomEvent | null {
  if (!isObj(v)) return null
  const start = num(v.start, NaN)
  const end = num(v.end, NaN)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const f = isObj(v.focus) ? v.focus : {}
  const focus: ZoomFocus = f.mode === 'fixed' ? { mode: 'fixed', x: num(f.x, 0.5), y: num(f.y, 0.5) } : { mode: 'cursor' }
  return sanitizeZoom(
    {
      id: str(v.id, newId('zoom')),
      start,
      end,
      scale: num(v.scale, 1.8),
      focus,
      easing: oneOf(v.easing, EASING_IDS, 'smooth'),
      transition: num(v.transition, DEFAULT_TRANSITION),
      // A named or disabled Moment is a user edit: never let regeneration discard it.
      origin: v.origin === 'auto' && !(typeof v.label === 'string' && v.label.trim()) && v.disabled !== true ? 'auto' : 'manual',
      ...(typeof v.label === 'string' && v.label.trim() ? { label: v.label.trim().slice(0, 80) } : {}),
      ...(v.disabled === true ? { disabled: true } : {}),
    },
    duration,
  )
}

function parseSound(raw: Obj, version: number): SoundSettings {
  // v1/v2 had no extra tracks; the recording's own audio plays at full volume, as before.
  if (version < 3 || !isObj(raw.sound)) return { mainGain: 1, tracks: [] }
  const s = raw.sound
  const tracks: SoundTrack[] = (Array.isArray(s.tracks) ? s.tracks.slice(0, MAX_SOUND_TRACKS) : [])
    .filter(isObj)
    .filter((t) => typeof t.path === 'string' && t.path.length > 0 && t.path.length <= 4096)
    .map((t) => ({
      id: str(t.id, newId('sound')),
      kind: t.kind === 'microphone' ? 'microphone' : 'imported',
      label: str(t.label, 'Audio').slice(0, 60) || 'Audio',
      path: t.path as string,
      gain: clamp(num(t.gain, 1), 0, 2),
    }))
  return { mainGain: clamp(num(s.mainGain, 1), 0, 2), tracks }
}

function parseCamera(raw: Obj, version: number): CameraSettings {
  if (version < 2 || !isObj(raw.camera)) {
    // Migration from 0.1: keep the old camera exactly (no dead zone, 0.45 s follow smoothing).
    const feel = LEGACY_FEEL[oneOf(raw.autoZoom, LEGACY_LEVELS, 'off')]
    return { ...defaultCamera(feel), followSmoothing: 0.5, deadzone: 0, minHandoff: LEGACY_HANDOFF }
  }
  const c = raw.camera
  const feel = oneOf(c.feel, FEELS, 'still')
  const base = defaultCamera(feel)
  return {
    feel,
    intensity: clamp(num(c.intensity, base.intensity), 0.5, 1.5),
    speed: clamp(num(c.speed, base.speed), 0.5, 1.5),
    softness: clamp(num(c.softness, base.softness), 0, 1),
    followSmoothing: clamp(num(c.followSmoothing, 0.5), 0, 1),
    deadzone: clamp(num(c.deadzone, 0), 0, 0.15),
    minHandoff: clamp(num(c.minHandoff, MIN_HANDOFF), 0, 2),
  }
}

/** Parses and normalizes a project file. Throws ProjectValidationError on unusable input. */
export function parseProject(raw: unknown): Project {
  if (!isObj(raw)) throw new ProjectValidationError('Project file is not a JSON object.')
  const version = num(raw.version, NaN)
  if (!Number.isFinite(version)) throw new ProjectValidationError('Project file has no version.')
  if (version > PROJECT_FORMAT_VERSION) {
    throw new ProjectValidationError('This project was created by a newer version of FrameFlow.')
  }
  const m = raw.media
  if (!isObj(m) || typeof m.path !== 'string' || m.path.length === 0) {
    throw new ProjectValidationError('Project file does not reference a video.')
  }
  const duration = num(m.duration, 0)
  if (duration <= 0) throw new ProjectValidationError('Project media has an invalid duration.')
  if (m.path.length > 4096) throw new ProjectValidationError('Project media path is too long.')
  const media: MediaInfo = {
    path: m.path,
    width: Math.max(1, Math.round(num(m.width, 1920))),
    height: Math.max(1, Math.round(num(m.height, 1080))),
    duration,
    hasAudio: m.hasAudio === true,
    cursorPath: typeof m.cursorPath === 'string' && m.cursorPath ? m.cursorPath : null,
    cursorEmbedded: m.cursorEmbedded !== false,
  }
  const fr = isObj(raw.frame) ? raw.frame : {}
  const defaults = findStylePreset(DEFAULT_STYLE)!
  const frame: FrameStyle = {
    padding: clamp(num(fr.padding, defaults.frame.padding), 0, 0.3),
    radius: clamp(num(fr.radius, defaults.frame.radius), 0, 80),
    shadow: clamp(num(fr.shadow, defaults.frame.shadow), 0, 1),
    scale: clamp(num(fr.scale, 1), 0.5, 1),
    ...(typeof fr.shadowTint === 'string' && HEX.test(fr.shadowTint) ? { shadowTint: fr.shadowTint } : {}),
  }
  const cu = isObj(raw.cursor) ? raw.cursor : {}
  const cursor: CursorStyle = {
    visible: cu.visible === true,
    size: clamp(num(cu.size, 1.4), 0.5, 3),
    smoothing: clamp(num(cu.smoothing, 0.6), 0, 1),
    clickEffect: cu.clickEffect !== false,
    // v1 files have only clickEffect: ripple ⇒ Pulse, none ⇒ Natural (both pixel-identical).
    effect: version >= 2 ? oneOf(cu.effect, EFFECTS, 'natural') : cu.clickEffect !== false ? 'pulse' : 'natural',
    effectIntensity: clamp(num(cu.effectIntensity, 1), 0, 1),
  }
  cursor.clickEffect = cursor.effect === 'pulse'
  const ex = isObj(raw.export) ? raw.export : {}
  const exportSettings: ExportSettings = {
    resolution: oneOf(ex.resolution, RESOLUTIONS, 1080),
    fps: ex.fps === 30 ? 30 : 60,
    quality: ex.quality === 'standard' ? 'standard' : 'high',
  }
  const zooms = (Array.isArray(raw.zooms) ? raw.zooms.slice(0, MAX_EVENTS) : [])
    .map((z) => parseZoom(z, duration))
    .filter((z): z is ZoomEvent => z !== null)
    .sort((a, b) => a.start - b.start)
  const trims = normalizeTrims(
    (Array.isArray(raw.trims) ? raw.trims.slice(0, MAX_EVENTS) : [])
      .filter(isObj)
      .map((t) => ({ id: str(t.id, newId('trim')), start: num(t.start, 0), end: num(t.end, 0) })),
    duration,
  )
  const now = new Date().toISOString()
  return {
    version: PROJECT_FORMAT_VERSION,
    id: str(raw.id, newId('proj')),
    name: str(raw.name, 'Untitled').slice(0, 200) || 'Untitled',
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
    mode: raw.mode === 'advanced' ? 'advanced' : 'quick',
    media,
    style: oneOf(raw.style, STYLES, 'custom'),
    aspectRatio: oneOf(raw.aspectRatio, ASPECTS, '16:9'),
    background: parseBackground(raw.background),
    frame,
    cursor,
    camera: parseCamera(raw, version),
    sound: parseSound(raw, version),
    zooms,
    trims,
    export: exportSettings,
  }
}

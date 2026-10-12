import {
  PROJECT_FORMAT_VERSION,
  type AspectRatio,
  type AutoZoomLevel,
  type Background,
  type CursorStyle,
  type CursorTrack,
  type EasingId,
  type ExportSettings,
  type FrameStyle,
  type MediaInfo,
  type Project,
  type StylePresetId,
  type TrimRange,
  type ZoomEvent,
  type ZoomFocus,
} from './project'
import { BACKGROUND_PRESETS, findStylePreset } from './styles'
import { regenerateAutoZooms } from './engine/autoZoom'
import { DEFAULT_TRANSITION, MAX_ZOOM_SCALE, MIN_ZOOM_DURATION } from './engine/camera'
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
  autoZoom?: AutoZoomLevel
  aspectRatio?: AspectRatio
  now?: Date
}

/** Creates a project with professional defaults and automatic zooms already applied. */
export function createProject(opts: CreateProjectOptions): Project {
  const style = findStylePreset(opts.style ?? 'clean')
  const now = (opts.now ?? new Date()).toISOString()
  const autoZoom = opts.autoZoom ?? (opts.cursorTrack ? 'subtle' : 'off')
  const base: Project = {
    version: PROJECT_FORMAT_VERSION,
    id: newId('proj'),
    name: opts.name,
    createdAt: now,
    updatedAt: now,
    mode: 'quick',
    media: opts.media,
    style: style.id,
    aspectRatio: opts.aspectRatio ?? '16:9',
    background: style.background,
    frame: { ...style.frame },
    cursor: { visible: !opts.media.cursorEmbedded && !!opts.cursorTrack, ...style.cursor },
    autoZoom,
    zooms: [],
    trims: [],
    export: { ...DEFAULT_EXPORT },
  }
  return { ...base, zooms: regenerateAutoZooms([], opts.cursorTrack, opts.media.duration, autoZoom) }
}

/** Applies a style preset's look (background, frame, cursor feel) without touching edits. */
export function applyStyle(project: Project, id: StylePresetId): Project {
  const style = findStylePreset(id)
  return {
    ...project,
    style: id,
    background: style.background,
    frame: { ...style.frame },
    cursor: { ...project.cursor, ...style.cursor },
  }
}

export function setAutoZoom(project: Project, level: AutoZoomLevel, track: CursorTrack | null): Project {
  return { ...project, autoZoom: level, zooms: regenerateAutoZooms(project.zooms, track, project.media.duration, level) }
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
const LEVELS: readonly AutoZoomLevel[] = ['off', 'subtle', 'dynamic']
const STYLES: readonly StylePresetId[] = ['clean', 'minimal', 'colorful']
const EASING_IDS: readonly EasingId[] = ['smooth', 'snappy', 'linear']
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
  return findStylePreset('clean').background
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
      origin: v.origin === 'auto' ? 'auto' : 'manual',
    },
    duration,
  )
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
  const defaults = findStylePreset('clean')
  const frame: FrameStyle = {
    padding: clamp(num(fr.padding, defaults.frame.padding), 0, 0.3),
    radius: clamp(num(fr.radius, defaults.frame.radius), 0, 80),
    shadow: clamp(num(fr.shadow, defaults.frame.shadow), 0, 1),
    scale: clamp(num(fr.scale, 1), 0.5, 1),
  }
  const cu = isObj(raw.cursor) ? raw.cursor : {}
  const cursor: CursorStyle = {
    visible: cu.visible === true,
    size: clamp(num(cu.size, 1.4), 0.5, 3),
    smoothing: clamp(num(cu.smoothing, 0.6), 0, 1),
    clickEffect: cu.clickEffect !== false,
  }
  const ex = isObj(raw.export) ? raw.export : {}
  const exportSettings: ExportSettings = {
    resolution: oneOf(ex.resolution, RESOLUTIONS, 1080),
    fps: ex.fps === 30 ? 30 : 60,
    quality: ex.quality === 'standard' ? 'standard' : 'high',
  }
  const zooms = (Array.isArray(raw.zooms) ? raw.zooms : [])
    .map((z) => parseZoom(z, duration))
    .filter((z): z is ZoomEvent => z !== null)
    .sort((a, b) => a.start - b.start)
  const trims = normalizeTrims(
    (Array.isArray(raw.trims) ? raw.trims : [])
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
    style: oneOf(raw.style, STYLES, 'clean'),
    aspectRatio: oneOf(raw.aspectRatio, ASPECTS, '16:9'),
    background: parseBackground(raw.background),
    frame,
    cursor,
    autoZoom: oneOf(raw.autoZoom, LEVELS, 'off'),
    zooms,
    trims,
    export: exportSettings,
  }
}

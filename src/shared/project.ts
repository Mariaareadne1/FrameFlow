/**
 * The FrameFlow project model. Quick Demo and the Advanced Editor are two views over
 * this exact structure; the preview renderer and the exporter both consume it.
 *
 * Time convention: every timestamp stored in a project (zooms, trims, cursor samples)
 * is in SOURCE seconds — seconds into the original media file. Trimming therefore
 * never moves zooms or cursor data relative to the footage they belong to.
 *
 * Space convention: cursor positions and zoom focus points are normalized to the
 * source video frame: (0,0) top-left, (1,1) bottom-right.
 */

export const PROJECT_FORMAT_VERSION = 1
export const PROJECT_FILE_EXTENSION = 'frameflow'

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3'
export type AutoZoomLevel = 'off' | 'subtle' | 'dynamic'
export type StylePresetId = 'clean' | 'minimal' | 'colorful'
export type EasingId = 'smooth' | 'snappy' | 'linear'
export type EditorMode = 'quick' | 'advanced'

export interface Point {
  x: number
  y: number
}

export type ZoomFocus = { mode: 'cursor' } | { mode: 'fixed'; x: number; y: number }

export interface ZoomEvent {
  id: string
  /** Source seconds where the zoom starts ramping in. */
  start: number
  /** Source seconds where the zoom has fully ramped out. */
  end: number
  /** Magnification at full zoom (1 = none). */
  scale: number
  focus: ZoomFocus
  easing: EasingId
  /** Seconds spent ramping in (and out). Clamped to half the event length at render time. */
  transition: number
  /** 'auto' events are regenerated when the auto-zoom level changes; 'manual' ones never are. */
  origin: 'auto' | 'manual'
}

/** A removed section of the source, in source seconds. */
export interface TrimRange {
  id: string
  start: number
  end: number
}

export type Background =
  | { kind: 'preset'; presetId: string }
  | { kind: 'solid'; color: string }

export interface FrameStyle {
  /** Padding around the video as a fraction of the shorter output side (0 – 0.3). */
  padding: number
  /** Corner radius in output pixels at a 1080px reference short side. */
  radius: number
  /** Shadow strength 0 – 1. */
  shadow: number
  /** Inset of the video inside its padded area, 0.5 – 1. 1 = fill the available area. */
  scale: number
}

export interface CursorStyle {
  visible: boolean
  /** Multiplier for cursor size, 0.5 – 3. */
  size: number
  /** 0 = raw movement, 1 = very smooth. */
  smoothing: number
  clickEffect: boolean
}

export interface ExportSettings {
  /** Short side of the output in pixels. */
  resolution: 720 | 1080 | 1440 | 2160
  fps: 30 | 60
  quality: 'standard' | 'high'
}

export interface MediaInfo {
  /** Absolute path of the source video. */
  path: string
  width: number
  height: number
  /** Seconds. */
  duration: number
  hasAudio: boolean
  /** Absolute path to the cursor track JSON, if one was recorded. */
  cursorPath: string | null
  /** True when the system cursor is baked into the pixels (e.g. imported videos). */
  cursorEmbedded: boolean
}

export interface Project {
  version: number
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** The last editing surface used; purely a UI hint. */
  mode: EditorMode
  media: MediaInfo
  style: StylePresetId
  aspectRatio: AspectRatio
  background: Background
  frame: FrameStyle
  cursor: CursorStyle
  autoZoom: AutoZoomLevel
  zooms: ZoomEvent[]
  trims: TrimRange[]
  export: ExportSettings
}

/** Recorded cursor telemetry, stored next to the recording as JSON. */
export interface CursorTrack {
  version: number
  /** Samples sorted by t; t in source seconds, x/y normalized to the video frame. */
  samples: CursorSample[]
  clicks: ClickEvent[]
}

export interface CursorSample {
  t: number
  x: number
  y: number
}

export interface ClickEvent {
  t: number
  x: number
  y: number
  button: 'left' | 'right'
}

export interface RecentProject {
  path: string
  name: string
  updatedAt: string
  duration: number
  thumbnail: string | null
}

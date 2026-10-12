import type { Project, RecentProject } from './project'

/** The complete, typed surface the renderer may use. Exposed as `window.frameflow`. */

export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' | 'unsupported'

export interface CaptureSource {
  /** 'display' ids are CGDirectDisplayIDs; 'window' ids are CGWindowIDs. */
  type: 'display' | 'window'
  id: number
  name: string
  appName?: string
  thumbnail: string | null
  width?: number
  height?: number
}

export interface StartRecordingOptions {
  source: { type: 'display' | 'window'; id: number }
  microphone: boolean
  /** Seconds of countdown shown before capture begins. */
  countdown: number
}

export interface RecordingResult {
  folder: string
  videoPath: string
  cursorPath: string | null
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

export type CaptureEvent =
  | { type: 'countdown'; remaining: number }
  | { type: 'started'; width: number; height: number }
  | { type: 'progress'; seconds: number }
  | { type: 'stopping' }
  | { type: 'stopped'; result: RecordingResult }
  | { type: 'error'; code: string; message: string }

export interface OpenedProject {
  path: string
  project: Project
  mediaMissing: boolean
  /** Raw cursor JSON (validated by the renderer), or null. */
  cursor: unknown
}

export interface ReadHandle {
  handle: number
  size: number
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  isTest: boolean
  libraryPath: string
}

export interface FrameFlowAPI {
  app: {
    info(): Promise<AppInfo>
    revealInFinder(path: string): Promise<void>
  }
  capture: {
    permission(): Promise<PermissionState>
    openPermissionSettings(): Promise<void>
    listSources(): Promise<CaptureSource[]>
    start(options: StartRecordingOptions): Promise<void>
    stop(): Promise<void>
    cancel(): Promise<void>
    onEvent(listener: (event: CaptureEvent) => void): () => void
  }
  media: {
    /** URL the <video> element can stream (supports range requests). */
    url(path: string): string
    open(path: string): Promise<ReadHandle>
    read(handle: number, start: number, end: number): Promise<Uint8Array>
    close(handle: number): Promise<void>
    /** Asks the user for a video file to import. Returns its path or null. */
    chooseVideo(): Promise<string | null>
    exists(path: string): Promise<boolean>
  }
  project: {
    /** Creates a project folder in the library for a new project, returning the .frameflow path. */
    createPath(name: string, folder?: string): Promise<string>
    save(path: string, project: Project, thumbnail: string | null): Promise<void>
    saveAs(project: Project, thumbnail: string | null): Promise<string | null>
    open(path: string): Promise<OpenedProject>
    chooseAndOpen(): Promise<OpenedProject | null>
    recent(): Promise<RecentProject[]>
    forget(path: string): Promise<void>
    readCursor(path: string): Promise<unknown>
  }
  export: {
    chooseDestination(defaultName: string): Promise<string | null>
    begin(path: string): Promise<number>
    write(handle: number, position: number, data: Uint8Array): Promise<void>
    finish(handle: number): Promise<void>
    abort(handle: number): Promise<void>
  }
}

export const IPC = {
  appInfo: 'app:info',
  reveal: 'app:reveal',
  capturePermission: 'capture:permission',
  captureOpenSettings: 'capture:open-settings',
  captureList: 'capture:list',
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureCancel: 'capture:cancel',
  captureEvent: 'capture:event',
  mediaOpen: 'media:open',
  mediaRead: 'media:read',
  mediaClose: 'media:close',
  mediaChoose: 'media:choose',
  mediaExists: 'media:exists',
  projectCreatePath: 'project:create-path',
  projectSave: 'project:save',
  projectSaveAs: 'project:save-as',
  projectOpen: 'project:open',
  projectChooseOpen: 'project:choose-open',
  projectRecent: 'project:recent',
  projectForget: 'project:forget',
  projectReadCursor: 'project:read-cursor',
  exportChoose: 'export:choose',
  exportBegin: 'export:begin',
  exportWrite: 'export:write',
  exportFinish: 'export:finish',
  exportAbort: 'export:abort',
} as const

export const MEDIA_SCHEME = 'ffmedia'

/** Encodes a filesystem path into an ffmedia:// URL (base64url keeps it opaque and safe). */
export function mediaUrlFor(path: string): string {
  const bytes = new TextEncoder().encode(path)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${MEDIA_SCHEME}://media/${b64}`
}

export function pathFromMediaUrl(url: string): string | null {
  const prefix = `${MEDIA_SCHEME}://media/`
  if (!url.startsWith(prefix)) return null
  const b64 = url.slice(prefix.length).split(/[?#]/)[0]!.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

import type { RecordingResult } from '@shared/ipc'
import type { AspectRatio, Project } from '@shared/project'
import { parseCursorTrack } from '@shared/engine/cursor'
import { createProject } from '@shared/projectModel'
import { probeMedia } from '../media/source'
import { useEditor } from '../state/editorStore'
import type { Preferences } from './prefs'

function defaultName(prefix: string): string {
  const d = new Date()
  return `${prefix} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** Turns a finished recording into a saved project with automatic edits applied. */
export async function projectFromRecording(result: RecordingResult, prefs: Preferences, aspectRatio: AspectRatio = '16:9'): Promise<void> {
  const api = window.frameflow
  const probe = await probeMedia(result.videoPath)
  const rawCursor = result.cursorPath ? await api.project.readCursor(result.cursorPath).catch(() => null) : null
  const track = parseCursorTrack(rawCursor)
  const name = defaultName('Demo')
  const project = createProject({
    name,
    media: {
      path: result.videoPath,
      width: probe.width,
      height: probe.height,
      duration: probe.duration,
      hasAudio: probe.hasAudio,
      cursorPath: track ? result.cursorPath : null,
      cursorEmbedded: false,
    },
    cursorTrack: track,
    style: prefs.style,
    autoZoom: track ? prefs.autoZoom : 'off',
    aspectRatio,
  })
  const path = await api.project.createPath(name, result.folder)
  await api.project.save(path, project, null)
  useEditor.getState().load({ project, path, cursor: rawCursor, mediaMissing: false })
}

/** Imports an existing video file as a new project. Returns false if the user cancelled. */
export async function projectFromImport(prefs: Preferences): Promise<boolean> {
  const api = window.frameflow
  const file = await api.media.chooseVideo()
  if (!file) return false
  const probe = await probeMedia(file)
  const base = file.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Imported Video'
  const project: Project = {
    ...createProject({
      name: base,
      media: { path: file, width: probe.width, height: probe.height, duration: probe.duration, hasAudio: probe.hasAudio, cursorPath: null, cursorEmbedded: true },
      cursorTrack: null,
      style: prefs.style,
      autoZoom: 'off',
    }),
    mode: 'advanced',
  }
  const path = await api.project.createPath(base)
  await api.project.save(path, project, null)
  useEditor.getState().load({ project, path, cursor: null, mediaMissing: false })
  return true
}

export async function openProjectAt(path: string): Promise<void> {
  const opened = await window.frameflow.project.open(path)
  useEditor.getState().load(opened)
}

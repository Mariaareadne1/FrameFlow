import { useEffect } from 'react'
import { useEditor } from '../state/editorStore'
import { errorMessage } from './format'

const AUTOSAVE_DELAY_MS = 700

let thumbnailProvider: (() => string | null) | null = null

/** The preview registers a function that renders a small JPEG for the recents list. */
export function setThumbnailProvider(fn: (() => string | null) | null): void {
  thumbnailProvider = fn
}

export async function saveNow(): Promise<void> {
  const { project, projectPath, markSaved } = useEditor.getState()
  if (!project || !projectPath) return
  try {
    await window.frameflow.project.save(projectPath, project, thumbnailProvider?.() ?? null)
    if (useEditor.getState().project === project) markSaved(null)
  } catch (err) {
    markSaved(`Could not save: ${errorMessage(err)}`)
  }
}

/** Saves edits shortly after they happen. Projects are always on disk. */
export function useAutosave(): void {
  const project = useEditor((s) => s.project)
  const dirty = useEditor((s) => s.dirty)
  useEffect(() => {
    if (!project || !dirty) return
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [project, dirty])
}

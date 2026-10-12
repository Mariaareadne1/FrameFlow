import { create } from 'zustand'
import type { CursorTrack, EditorMode, Project } from '@shared/project'
import { parseCursorTrack } from '@shared/engine/cursor'

const HISTORY_LIMIT = 100
/** Successive edits with the same key inside this window collapse into one undo step. */
const COALESCE_MS = 900

export type Selection = { kind: 'zoom'; id: string } | { kind: 'trim'; id: string } | null

export interface EditorState {
  project: Project | null
  projectPath: string | null
  track: CursorTrack | null
  mediaMissing: boolean
  past: Project[]
  future: Project[]
  selection: Selection
  dirty: boolean
  saveError: string | null
  lastEdit: { key: string; at: number } | null

  load(args: { project: Project; path: string; cursor: unknown; mediaMissing: boolean }): void
  close(): void
  /** Applies an edit. Pass a `coalesce` key for continuous gestures (slider drags, timeline drags). */
  apply(fn: (p: Project) => Project, coalesce?: string): void
  /**
   * Applies a change that is not an undoable edit (mode switch, relinked media) to the
   * present AND every history entry, so undo/redo never brings stale values back.
   */
  patchAll(fn: (p: Project) => Project): void
  /** Ends a continuous gesture so the next edit starts a new undo step. */
  endGesture(): void
  undo(): void
  redo(): void
  select(selection: Selection): void
  setMode(mode: EditorMode): void
  markSaved(error?: string | null): void
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  projectPath: null,
  track: null,
  mediaMissing: false,
  past: [],
  future: [],
  selection: null,
  dirty: false,
  saveError: null,
  lastEdit: null,

  load: ({ project, path, cursor, mediaMissing }) =>
    set({
      project,
      projectPath: path,
      track: parseCursorTrack(cursor),
      mediaMissing,
      past: [],
      future: [],
      selection: null,
      dirty: false,
      saveError: null,
      lastEdit: null,
    }),

  close: () => set({ project: null, projectPath: null, track: null, past: [], future: [], selection: null, dirty: false, lastEdit: null }),

  apply: (fn, coalesce) => {
    const { project, past, lastEdit } = get()
    if (!project) return
    const next = fn(project)
    if (next === project) return
    const now = Date.now()
    const merge = !!coalesce && lastEdit?.key === coalesce && now - lastEdit.at < COALESCE_MS
    set({
      project: { ...next, updatedAt: new Date().toISOString() },
      past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
      lastEdit: coalesce ? { key: coalesce, at: now } : null,
    })
  },

  patchAll: (fn) => {
    const { project, past, future } = get()
    if (!project) return
    set({ project: fn(project), past: past.map(fn), future: future.map(fn), dirty: true })
  },

  endGesture: () => set({ lastEdit: null }),

  undo: () => {
    const { project, past, future } = get()
    const prev = past[past.length - 1]
    if (!project || !prev) return
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], dirty: true, lastEdit: null, selection: keepSelection(get().selection, prev) })
  },

  redo: () => {
    const { project, past, future } = get()
    const next = future[0]
    if (!project || !next) return
    set({ project: next, past: [...past, project], future: future.slice(1), dirty: true, lastEdit: null, selection: keepSelection(get().selection, next) })
  },

  select: (selection) => set({ selection }),

  setMode: (mode) => {
    const { project } = get()
    if (!project || project.mode === mode) return
    get().patchAll((p) => ({ ...p, mode }))
  },

  markSaved: (error = null) => set({ dirty: error ? get().dirty : false, saveError: error }),
}))

function keepSelection(sel: Selection, p: Project): Selection {
  if (!sel) return null
  if (sel.kind === 'zoom') return p.zooms.some((z) => z.id === sel.id) ? sel : null
  return p.trims.some((t) => t.id === sel.id) ? sel : null
}

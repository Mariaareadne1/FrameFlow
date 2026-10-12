import { useEffect } from 'react'
import { addManualZoom, addTrim, removeTrim, removeZoom } from '@shared/projectModel'
import { useEditor } from '../state/editorStore'
import { playback, usePlayhead } from '../state/playhead'
import { saveNow } from './autosave'

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Editor keyboard shortcuts. `advanced` enables timeline editing keys. */
export function useEditorShortcuts(advanced: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || document.querySelector('[role="dialog"]')) return
      const ed = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space') {
        e.preventDefault()
        playback.toggle()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) ed.redo()
        else ed.undo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      } else if (!advanced) {
        return
      } else if (e.key === 'z' && !mod && ed.project) {
        const { project, zoom } = addManualZoom(ed.project, usePlayhead.getState().time, !!ed.track)
        ed.apply(() => project)
        ed.select({ kind: 'zoom', id: zoom.id })
      } else if (e.key === 'c' && !mod && ed.project) {
        const t = usePlayhead.getState().time
        ed.apply((p) => addTrim(p, t, Math.min(p.media.duration, t + Math.min(2, p.media.duration / 4))))
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && ed.selection) {
        const sel = ed.selection
        ed.apply((p) => (sel.kind === 'zoom' ? removeZoom(p, sel.id) : removeTrim(p, sel.id)))
        ed.select(null)
      } else if (e.key === 'Escape') {
        ed.select(null)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = e.shiftKey ? 1 : 1 / 30
        playback.seek(usePlayhead.getState().time + (e.key === 'ArrowLeft' ? -step : step))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advanced])
}

import { useEffect, useState } from 'react'
import { ArrowLeft, Redo2, Undo2 } from 'lucide-react'
import { useApp } from '../../state/appStore'
import { useEditor } from '../../state/editorStore'
import { playback } from '../../state/playhead'
import { saveNow } from '../../lib/autosave'
import { Button, IconButton } from '../ui'

export function TopBar() {
  const project = useEditor((s) => s.project)
  const dirty = useEditor((s) => s.dirty)
  const saveError = useEditor((s) => s.saveError)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const apply = useEditor((s) => s.apply)
  const navigate = useApp((s) => s.navigate)
  const setExportOpen = useApp((s) => s.setExportOpen)
  const [name, setName] = useState(project?.name ?? '')
  useEffect(() => setName(project?.name ?? ''), [project?.name])
  if (!project) return null

  return (
    <header className="drag-region grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center pl-24 pr-4">
      <div className="no-drag flex items-center">
        <Button
          variant="ghost"
          data-testid="go-home"
          onClick={async () => {
            playback.pause()
            await saveNow()
            navigate({ name: 'home' })
          }}
        >
          <ArrowLeft size={15} /> Projects
        </Button>
      </div>
      <div className="no-drag flex min-w-0 flex-col items-center">
        <input
          aria-label="Project name"
          data-testid="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim().slice(0, 120)
            if (trimmed && trimmed !== project.name) apply((p) => ({ ...p, name: trimmed }))
            else setName(project.name)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="font-display w-[360px] truncate rounded-md bg-transparent px-2 text-center text-[21px] leading-7 text-ink outline-none hover:bg-sunk/60 focus:bg-surface focus:ring-2 focus:ring-lavender"
        />
        <span className="text-[11px] leading-4 text-ink-3" data-testid="save-state" title={saveError ?? undefined}>
          {saveError ? <span className="text-coral-ink">Not saved</span> : dirty ? 'Saving…' : 'Saved'}
        </span>
      </div>
      <div className="no-drag flex items-center justify-end gap-1">
        <IconButton label="Undo (⌘Z)" data-testid="undo" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" data-testid="redo" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        <Button variant="primary" className="ml-2" data-testid="open-export" onClick={() => setExportOpen(true)}>
          Export
        </Button>
      </div>
    </header>
  )
}

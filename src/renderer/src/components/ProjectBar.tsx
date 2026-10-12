import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, Download } from 'lucide-react'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { playback } from '../state/playhead'
import { saveNow } from '../lib/autosave'
import { Button } from './ui'

export function ProjectBar({ children }: { children?: ReactNode }) {
  const project = useEditor((s) => s.project)
  const dirty = useEditor((s) => s.dirty)
  const saveError = useEditor((s) => s.saveError)
  const apply = useEditor((s) => s.apply)
  const navigate = useApp((s) => s.navigate)
  const setExportOpen = useApp((s) => s.setExportOpen)
  const [name, setName] = useState(project?.name ?? '')
  useEffect(() => setName(project?.name ?? ''), [project?.name])
  if (!project) return null

  return (
    <header className="drag-region flex h-13 shrink-0 items-center gap-3 border-b border-line pl-24 pr-3" style={{ height: 52 }}>
      <Button
        variant="ghost"
        className="no-drag"
        data-testid="go-home"
        onClick={async () => {
          playback.pause()
          await saveNow()
          navigate({ name: 'home' })
        }}
      >
        <ChevronLeft size={15} /> Home
      </Button>
      <div className="no-drag flex min-w-0 items-center gap-2">
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
          className="w-56 truncate rounded-md bg-transparent px-2 py-1 text-[13px] font-medium outline-none hover:bg-white/5 focus:bg-white/5 focus:ring-1 focus:ring-accent"
        />
        <span className="text-[11px] text-subtle" data-testid="save-state" title={saveError ?? undefined}>
          {saveError ? <span className="text-danger">Not saved</span> : dirty ? 'Saving…' : 'Saved'}
        </span>
      </div>
      <div className="no-drag ml-auto flex items-center gap-2">
        {children}
        <Button variant="primary" data-testid="open-export" onClick={() => setExportOpen(true)}>
          <Download size={15} /> Export Video
        </Button>
      </div>
    </header>
  )
}

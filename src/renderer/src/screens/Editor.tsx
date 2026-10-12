import { Redo2, Sparkles, Undo2 } from 'lucide-react'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { playback } from '../state/playhead'
import { useEditorShortcuts } from '../lib/shortcuts'
import { Preview } from '../components/Preview'
import { ProjectBar } from '../components/ProjectBar'
import { MissingMedia } from '../components/MissingMedia'
import { Timeline } from '../components/Timeline'
import { Inspector } from '../components/Inspector'
import { Button, IconButton } from '../components/ui'

export function Editor() {
  const project = useEditor((s) => s.project)
  const track = useEditor((s) => s.track)
  const mediaMissing = useEditor((s) => s.mediaMissing)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const setMode = useEditor((s) => s.setMode)
  const navigate = useApp((s) => s.navigate)
  useEditorShortcuts(true)
  if (!project) return null

  return (
    <div className="flex h-full flex-col" data-testid="advanced-editor">
      <ProjectBar>
        <IconButton label="Undo (⌘Z)" data-testid="undo" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" data-testid="redo" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        <Button
          variant="ghost"
          data-testid="open-quick"
          onClick={() => {
            playback.pause()
            setMode('quick')
            navigate({ name: 'quick' })
          }}
        >
          <Sparkles size={14} /> Quick Demo
        </Button>
      </ProjectBar>
      {mediaMissing ? (
        <MissingMedia />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <Preview project={project} track={track} className="flex-1 p-6" />
            <Inspector />
          </div>
          <div className="h-[200px] shrink-0">
            <Timeline />
          </div>
        </div>
      )}
    </div>
  )
}

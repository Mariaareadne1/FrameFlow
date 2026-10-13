import { useEffect } from 'react'
import { useEditor } from '../state/editorStore'
import { releaseGrabber } from '../lib/frameGrabber'
import { useStudio } from '../state/studioStore'
import { useEditorShortcuts } from '../lib/shortcuts'
import { Preview } from '../components/Preview'
import { MissingMedia } from '../components/MissingMedia'
import { Timeline } from '../components/Timeline'
import { TopBar } from '../components/studio/TopBar'
import { Transport } from '../components/studio/Transport'
import { Dock } from '../components/studio/Dock'
import { MomentsStrip } from '../components/studio/MomentsStrip'
import { MomentInspector, TrimInspector } from '../components/studio/EventInspector'
import { CameraPanel, CursorPanel, DesignPanel } from '../components/studio/Panels'
import { SoundPanel } from '../components/studio/SoundPanel'

/**
 * The Studio: one screen for every kind of editing. The styled composition is the hero;
 * Moments, Design, Camera, Cursor and the precision Timeline are sections around it that
 * all edit the same project, with one mounted preview (so switching never reloads media).
 */
export function Studio() {
  const project = useEditor((s) => s.project)
  const track = useEditor((s) => s.track)
  const mediaMissing = useEditor((s) => s.mediaMissing)
  const selection = useEditor((s) => s.selection)
  const section = useStudio((s) => s.section)
  const drawer = useStudio((s) => s.drawer)
  useEditorShortcuts(section === 'timeline')
  useEffect(() => releaseGrabber, [])
  if (!project) return null

  const zoom = selection?.kind === 'zoom' ? project.zooms.find((z) => z.id === selection.id) : undefined
  const trim = selection?.kind === 'trim' ? project.trims.find((t) => t.id === selection.id) : undefined
  const panel = drawer && (section === 'design' || section === 'camera' || section === 'cursor' || section === 'sound') ? section : null
  const inspector = panel ? null : zoom ? 'moment' : trim && section === 'timeline' ? 'trim' : null

  return (
    <div className="flex h-full flex-col bg-paper" data-testid="studio" data-section={section}>
      <TopBar />
      {mediaMissing ? (
        <MissingMedia />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <Preview project={project} track={track} className="flex-1 px-10 pb-3 pt-2" />
            <div className="shrink-0 px-10">
              <Transport project={project} />
            </div>
            <div className="flex shrink-0 justify-center py-3">
              <Dock />
            </div>
            {section === 'moments' && <MomentsStrip project={project} track={track} />}
            {section === 'timeline' && (
              <div className="h-[236px] shrink-0">
                <Timeline />
              </div>
            )}
          </div>
          {(panel || inspector) && (
            <aside key={panel ?? inspector ?? ''} className="ff-slide-in my-2 mr-3 flex w-[352px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-sheet)] bg-surface shadow-[var(--shadow-lift)]" data-testid="inspector">
              {panel === 'design' && <DesignPanel project={project} />}
              {panel === 'camera' && <CameraPanel project={project} />}
              {panel === 'cursor' && <CursorPanel project={project} />}
              {panel === 'sound' && <SoundPanel project={project} />}
              {inspector === 'moment' && zoom && <MomentInspector zoom={zoom} />}
              {inspector === 'trim' && trim && <TrimInspector trim={trim} />}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

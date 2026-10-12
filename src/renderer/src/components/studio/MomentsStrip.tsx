import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { clsx } from 'clsx'
import type { CursorTrack, Project } from '@shared/project'
import { momentViews, type MomentView } from '@shared/moments'
import { viewportOf } from '@shared/engine/camera'
import { addManualZoom } from '@shared/projectModel'
import { buildScene, sceneCamera, type RenderScene } from '../../engine/render'
import { useEditor } from '../../state/editorStore'
import { playback, usePlayhead } from '../../state/playhead'
import { useFrame } from '../../lib/frameGrabber'
import { formatTime } from '../../lib/format'
import { Badge } from '../ui'

function MomentCard({ moment, project, scene, selected, onSelect }: { moment: MomentView; project: Project; scene: RenderScene; selected: boolean; onSelect: () => void }) {
  const frame = useFrame(project.media.path, moment.focusTime, 320)
  const vp = moment.status === 'active' ? viewportOf(sceneCamera(scene, moment.focusTime)) : null
  const aspect = project.media.width / project.media.height
  return (
    <button
      onClick={onSelect}
      data-testid={`moment-card-${moment.id}`}
      data-moment-time={moment.focusTime.toFixed(3)}
      aria-pressed={selected}
      className={clsx(
        'group flex w-[208px] shrink-0 flex-col overflow-hidden rounded-[14px] bg-surface text-left transition-[box-shadow,transform] duration-200',
        selected ? '-translate-y-0.5 shadow-[0_0_0_2px_var(--color-ink),var(--shadow-lift)]' : 'shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
        moment.status === 'cut' && 'opacity-55',
      )}
    >
      <div className="relative w-full overflow-hidden bg-sunk" style={{ aspectRatio: `${Math.max(1.2, Math.min(2, aspect))}` }}>
        {frame ? (
          <img src={frame} alt="" data-testid="moment-thumb" className={clsx('h-full w-full object-contain', moment.status !== 'active' && 'grayscale-[60%]')} />
        ) : (
          <div className="ff-shimmer h-full w-full" />
        )}
        {vp && (
          <span
            aria-hidden
            className="absolute rounded-[3px] border-[1.5px] border-lavender shadow-[0_0_0_999px_rgba(37,38,43,0.18)]"
            style={{ left: `${vp.x * 100}%`, top: `${vp.y * 100}%`, width: `${vp.w * 100}%`, height: `${vp.h * 100}%` }}
          />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[10.5px] text-ink backdrop-blur">{formatTime(moment.outStart)}</span>
      </div>
      <div className="px-3 pb-2.5 pt-2">
        <div className="font-display truncate text-[18px] leading-6 text-ink">{moment.title}</div>
        <div className="truncate text-[11.5px] text-ink-2">{moment.subtitle}</div>
        <div className="mt-1.5 flex gap-1">
          <Badge tone={moment.status === 'active' ? 'lavender' : moment.status === 'cut' ? 'coral' : 'neutral'}>{moment.treatment}</Badge>
          {moment.origin === 'manual' && <Badge>Edited</Badge>}
        </div>
      </div>
    </button>
  )
}

/** The Moments filmstrip: every camera move as a card with a real frame from the video. */
export function MomentsStrip({ project, track }: { project: Project; track: CursorTrack | null }) {
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const apply = useEditor((s) => s.apply)
  const scene = useMemo(() => buildScene(project, track), [project, track])
  const moments = useMemo(() => momentViews(project.zooms, track?.clicks ?? [], project.trims, project.media.duration), [project.zooms, project.trims, track, project.media.duration])
  const hasTrack = !!track && track.samples.length > 0

  const addMoment = () => {
    const { project: next, zoom } = addManualZoom(project, usePlayhead.getState().time, hasTrack)
    apply(() => next)
    select({ kind: 'zoom', id: zoom.id })
  }

  return (
    <div className="ff-rise shrink-0 px-10 pb-5" data-testid="moments-strip">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-[22px] leading-none">Moments</h2>
          <span className="text-[12px] text-ink-2">{moments.length === 0 ? (hasTrack ? 'No camera moves yet' : 'This video has no cursor data — add Moments by hand') : `${moments.length} camera ${moments.length === 1 ? 'move' : 'moves'}`}</span>
        </div>
      </div>
      <div className="-mx-2 flex gap-3.5 overflow-x-auto px-2 pb-2 pt-1">
        {moments.map((m) => (
          <MomentCard
            key={m.id}
            moment={m}
            project={project}
            scene={scene}
            selected={selection?.kind === 'zoom' && selection.id === m.id}
            onSelect={() => {
              playback.pause()
              select({ kind: 'zoom', id: m.id })
              playback.seek(m.focusTime)
            }}
          />
        ))}
        <button
          onClick={addMoment}
          data-testid="add-moment"
          className="flex w-[150px] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-line text-[12.5px] font-medium text-ink-2 transition hover:border-ink-3 hover:bg-surface/60 hover:text-ink"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-soft)]">
            <Plus size={15} />
          </span>
          Add Moment
          <span className="text-[11px] font-normal text-ink-3">at the playhead</span>
        </button>
      </div>
    </div>
  )
}

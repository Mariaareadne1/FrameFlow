import { useMemo, useRef } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { Project } from '@shared/project'
import { keptSegments, outputDuration, outputToSource, sourceToOutput } from '@shared/engine/timeline'
import { momentViews } from '@shared/moments'
import { useEditor } from '../../state/editorStore'
import { playback, usePlayhead } from '../../state/playhead'
import { formatTime } from '../../lib/format'
import { IconButton } from '../ui'

/** Play controls, a scrubber with Moment ticks, and previous/next Moment. */
export function Transport({ project }: { project: Project }) {
  const track = useEditor((s) => s.track)
  const select = useEditor((s) => s.select)
  const time = usePlayhead((s) => s.time)
  const playing = usePlayhead((s) => s.playing)
  const barRef = useRef<HTMLDivElement>(null)
  const duration = project.media.duration
  const segments = useMemo(() => keptSegments(project.trims, duration), [project.trims, duration])
  const total = outputDuration(segments)
  const out = sourceToOutput(segments, time)
  const moments = useMemo(() => momentViews(project.zooms, track?.clicks ?? [], project.trims, duration).filter((m) => m.status !== 'cut'), [project.zooms, project.trims, track, duration])

  const jump = (dir: 1 | -1) => {
    const list = dir === 1 ? moments.filter((m) => m.outStart > out + 0.05) : moments.filter((m) => m.outStart < out - 0.3).reverse()
    const target = list[0]
    if (!target) return
    playback.pause()
    select({ kind: 'zoom', id: target.id })
    playback.seek(target.focusTime)
  }

  const seekFromPointer = (clientX: number) => {
    const el = barRef.current
    if (!el || total <= 0) return
    const r = el.getBoundingClientRect()
    const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    playback.seek(outputToSource(segments, k * total))
  }

  return (
    <div className="flex items-center gap-3" data-testid="transport">
      <IconButton label="Previous Moment" onClick={() => jump(-1)} disabled={moments.length === 0} data-testid="prev-moment">
        <SkipBack size={15} />
      </IconButton>
      <button
        aria-label={playing ? 'Pause' : 'Play'}
        data-testid="play-toggle"
        onClick={() => playback.toggle()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper shadow-[0_4px_14px_-4px_rgba(37,38,43,0.5)] transition hover:scale-[1.04] active:scale-95"
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>
      <IconButton label="Next Moment" onClick={() => jump(1)} disabled={moments.length === 0} data-testid="next-moment">
        <SkipForward size={15} />
      </IconButton>
      <span className="w-14 text-right font-mono text-[12px] tabular-nums text-ink" data-testid="timecode">
        {formatTime(out, true)}
      </span>
      <div
        ref={barRef}
        className="group relative h-8 flex-1 cursor-pointer"
        data-testid="scrubber"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          playback.pause()
          seekFromPointer(e.clientX)
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromPointer(e.clientX)}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-sunk-2" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink" style={{ width: `${total > 0 ? (out / total) * 100 : 0}%` }} />
        {moments.map((m) => (
          <span
            key={m.id}
            title={m.title}
            className={m.status === 'disabled' ? 'absolute top-[22px] h-1 rounded-full bg-ink-3/50' : 'absolute top-[22px] h-1 rounded-full bg-lavender'}
            style={{ left: `${(m.outStart / Math.max(total, 1e-6)) * 100}%`, width: `${Math.max(0.6, ((m.outEnd - m.outStart) / Math.max(total, 1e-6)) * 100)}%` }}
          />
        ))}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-[0_0_0_1.5px_var(--color-ink),0_2px_6px_rgba(37,38,43,0.25)] transition-transform group-active:scale-110"
          style={{ left: `${total > 0 ? (out / total) * 100 : 0}%` }}
        />
      </div>
      <span className="w-14 font-mono text-[12px] tabular-nums text-ink-3" data-testid="duration">
        {formatTime(total, true)}
      </span>
    </div>
  )
}

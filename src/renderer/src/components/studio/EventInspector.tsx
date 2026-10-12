import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Crosshair, MousePointer2, Play, Trash2, Undo2, X } from 'lucide-react'
import type { EasingId, TrimRange, ZoomEvent } from '@shared/project'
import { removeTrim, removeZoom, updateTrim, updateZoom } from '@shared/projectModel'
import { defaultMomentTitle, momentViews } from '@shared/moments'
import { keptSegments, outputToSource, sourceToOutput } from '@shared/engine/timeline'
import { useEditor } from '../../state/editorStore'
import { playback, usePlayhead } from '../../state/playhead'
import { formatTime } from '../../lib/format'
import { Badge, Button, IconButton, Section, Segmented, Slider, Toggle } from '../ui'

function TimeField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const [text, setText] = useState(value.toFixed(2))
  useEffect(() => setText(value.toFixed(2)), [value])
  const commit = () => {
    const v = Number(text)
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)))
    else setText(value.toFixed(2))
  }
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-ink-2">{label}</span>
      <div className="flex items-center rounded-[10px] bg-sunk focus-within:bg-surface focus-within:ring-2 focus-within:ring-lavender">
        <input
          aria-label={label}
          className="w-full bg-transparent px-3 py-2 font-mono text-[12.5px] text-ink outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="pr-3 text-[11px] text-ink-3">s</span>
      </div>
    </label>
  )
}

/** Pick the point a fixed-framing Moment centres on, over the raw frame at the playhead. */
function FocusPicker({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const time = usePlayhead((s) => s.time)
  const project = useEditor((s) => s.project)
  const aspect = project ? project.media.width / project.media.height : 16 / 9

  useEffect(() => {
    const canvas = canvasRef.current
    const video = playback.video()
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const paint = () => {
      ctx.fillStyle = '#efeee9'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }
    paint()
    // The seek may still be in flight; repaint once the new frame is decoded.
    video?.addEventListener('seeked', paint)
    video?.addEventListener('loadeddata', paint)
    return () => {
      video?.removeEventListener('seeked', paint)
      video?.removeEventListener('loadeddata', paint)
    }
  }, [time])

  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)))
  }
  return (
    <div>
      <div
        className="relative w-full cursor-crosshair overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_rgba(37,38,43,0.08)]"
        style={{ aspectRatio: `${aspect}` }}
        data-testid="focus-picker"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
      >
        <canvas ref={canvasRef} width={480} height={Math.round(480 / aspect)} className="h-full w-full" />
        <div className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-lavender/40 shadow-[0_0_0_1.5px_var(--color-ink)]" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">Click or drag to choose the point the camera frames.</p>
    </div>
  )
}

export function MomentInspector({ zoom }: { zoom: ZoomEvent }) {
  const project = useEditor((s) => s.project)!
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const hasCursor = !!track && track.samples.length > 0
  const duration = project.media.duration
  const segments = useMemo(() => keptSegments(project.trims, duration), [project.trims, duration])
  const view = useMemo(() => momentViews(project.zooms, track?.clicks ?? [], project.trims, duration).find((m) => m.id === zoom.id), [project, track, zoom.id, duration])
  const [label, setLabel] = useState(zoom.label ?? '')
  useEffect(() => setLabel(zoom.label ?? ''), [zoom.id, zoom.label])
  const set = (patch: Partial<ZoomEvent>, key?: string) => apply((p) => updateZoom(p, zoom.id, patch), key)
  const outDuration = sourceToOutput(segments, duration)
  const easings: Array<{ value: EasingId; label: string }> = [
    { value: 'smooth', label: 'Glide' },
    { value: 'crisp', label: 'Crisp' },
    { value: 'linear', label: 'Linear' },
    ...(zoom.easing === 'snappy' ? [{ value: 'snappy' as const, label: 'Snappy' }] : []),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="moment-inspector">
      <div className="px-5 pb-2 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
            {view ? `Moment ${String(view.index).padStart(2, '0')}` : 'Moment'}
            <Badge tone={zoom.origin === 'auto' ? 'lavender' : 'neutral'}>{zoom.origin === 'auto' ? 'Automatic' : 'Edited'}</Badge>
          </div>
          <IconButton label="Close" onClick={() => select(null)} data-testid="close-inspector">
            <X size={16} />
          </IconButton>
        </div>
        <input
          aria-label="Moment name"
          data-testid="moment-name"
          value={label}
          placeholder={view ? defaultMomentTitle(view.index) : 'Moment'}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const next = label.trim()
            if (next !== (zoom.label ?? '')) set(next ? { label: next } : { label: undefined })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="font-display -mx-1 mt-1 w-[calc(100%+8px)] rounded-md bg-transparent px-1 text-[30px] leading-9 text-ink outline-none placeholder:text-ink hover:bg-sunk/60 focus:bg-sunk"
        />
        {view && <p className="text-[12px] text-ink-2">{view.subtitle} · {view.status === 'cut' ? 'removed by a cut' : `${formatTime(view.outStart, true)} – ${formatTime(view.outEnd, true)}`}</p>}
        <div className="mt-4 flex gap-2">
          <Button size="sm" data-testid="play-moment" onClick={() => playback.playRange(Math.max(0, zoom.start - 0.4), Math.min(duration, zoom.end + 0.2))}>
            <Play size={12} fill="currentColor" /> Preview Moment
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Camera">
          <Toggle label="Camera movement" description={zoom.disabled ? 'This Moment is kept, but the camera stays wide.' : 'Zoom in on this Moment.'} checked={!zoom.disabled} onChange={(on) => set({ disabled: on ? undefined : true })} />
          <Slider label="Zoom" value={zoom.scale} min={1.1} max={4} step={0.05} onChange={(scale) => set({ scale }, `zoom-scale-${zoom.id}`)} format={(v) => `${v.toFixed(2)}×`} disabled={zoom.disabled} />
        </Section>
        <Section title="Framing">
          <Segmented
            label="Framing"
            value={zoom.focus.mode}
            onChange={(mode) => set(mode === 'cursor' ? { focus: { mode: 'cursor' } } : { focus: { mode: 'fixed', x: 0.5, y: 0.5 } })}
            options={[
              { value: 'cursor', label: <><MousePointer2 size={12} /> Follow cursor</>, disabled: !hasCursor, title: hasCursor ? undefined : 'Needs cursor data from a FrameFlow recording' },
              { value: 'fixed', label: <><Crosshair size={12} /> Fixed point</> },
            ]}
          />
          {zoom.focus.mode === 'fixed' && <FocusPicker x={zoom.focus.x} y={zoom.focus.y} onChange={(x, y) => set({ focus: { mode: 'fixed', x, y } }, `zoom-focus-${zoom.id}`)} />}
        </Section>
        <Section title="Motion">
          <div>
            <div className="mb-1.5 text-[12.5px] text-ink">Camera move</div>
            <Segmented<EasingId> label="Camera move" value={zoom.easing} onChange={(easing) => set({ easing })} options={easings} />
          </div>
          <Slider label="Transition" value={zoom.transition} min={0.1} max={2} step={0.05} onChange={(transition) => set({ transition }, `zoom-tr-${zoom.id}`)} format={(v) => `${v.toFixed(2)} s`} />
        </Section>
        <Section title="Timing" description="Times on the edited timeline, after cuts.">
          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Start" value={sourceToOutput(segments, zoom.start)} min={0} max={outDuration} onChange={(v) => set({ start: outputToSource(segments, v) })} />
            <TimeField label="End" value={sourceToOutput(segments, zoom.end)} min={0} max={outDuration} onChange={(v) => set({ end: outputToSource(segments, v) })} />
          </div>
        </Section>
        <div className="px-5 pb-6 pt-2">
          <Button
            variant="danger"
            className="w-full"
            data-testid="delete-zoom"
            onClick={() => {
              apply((p) => removeZoom(p, zoom.id))
              select(null)
            }}
          >
            <Trash2 size={14} /> Delete Moment
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TrimInspector({ trim }: { trim: TrimRange }) {
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const duration = useEditor((s) => s.project?.media.duration ?? 0)
  const set = (patch: Partial<TrimRange>) => apply((p) => updateTrim(p, trim.id, patch))
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="trim-inspector">
      <div className="flex items-start justify-between px-5 pb-2 pt-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Cut</div>
          <div className="font-display mt-1 text-[30px] leading-9">{formatTime(trim.end - trim.start, true)} removed</div>
          <p className="text-[12px] text-ink-2">Source time — Moments stay attached to their footage.</p>
        </div>
        <IconButton label="Close" onClick={() => select(null)}>
          <X size={16} />
        </IconButton>
      </div>
      <Section title="Range">
        <div className="grid grid-cols-2 gap-2">
          <TimeField label="Start" value={trim.start} min={0} max={duration} onChange={(start) => set({ start })} />
          <TimeField label="End" value={trim.end} min={0} max={duration} onChange={(end) => set({ end })} />
        </div>
      </Section>
      <div className="px-5 pt-2">
        <Button
          className="w-full"
          data-testid="delete-trim"
          onClick={() => {
            apply((p) => removeTrim(p, trim.id))
            select(null)
          }}
        >
          <Undo2 size={14} /> Restore section
        </Button>
      </div>
    </div>
  )
}

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Plus, Scissors, ZoomIn, ZoomOut } from 'lucide-react'
import { clsx } from 'clsx'
import type { Project, TrimRange, ZoomEvent } from '@shared/project'
import { addManualZoom, addTrim, updateTrim, updateZoom } from '@shared/projectModel'
import { keptSegments } from '@shared/engine/timeline'
import { useEditor } from '../state/editorStore'
import { playback, usePlayhead } from '../state/playhead'
import { formatTime } from '../lib/format'
import { Button, IconButton, Kbd } from './ui'

const LABEL_WIDTH = 72
const MIN_PX_PER_SECOND = 4

type DragKind = 'move' | 'start' | 'end'

interface DragState {
  kind: 'zoom' | 'trim'
  id: string
  mode: DragKind
  originX: number
  start: number
  end: number
}

function tickStep(pxPerSecond: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  return steps.find((s) => s * pxPerSecond >= 70) ?? 600
}

export function Timeline() {
  const project = useEditor((s) => s.project) as Project
  const track = useEditor((s) => s.track)
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const apply = useEditor((s) => s.apply)
  const time = usePlayhead((s) => s.time)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)
  const [scale, setScale] = useState(1)
  const dragRef = useRef<DragState | null>(null)

  const duration = project.media.duration
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setViewport(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pxPerSecond = Math.max(MIN_PX_PER_SECOND, ((viewport - LABEL_WIDTH - 24) / Math.max(duration, 0.1)) * scale)
  const contentWidth = duration * pxPerSecond
  const x = useCallback((t: number) => t * pxPerSecond, [pxPerSecond])
  const segments = useMemo(() => keptSegments(project.trims, duration), [project.trims, duration])

  const timeFromEvent = (e: { clientX: number }, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (e.clientX - rect.left) / pxPerSecond))
  }

  // ---- Scrubbing ----
  const onScrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    playback.pause()
    playback.seek(timeFromEvent(e, el))
    const move = (ev: PointerEvent) => playback.seek(timeFromEvent(ev, el))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  // ---- Dragging blocks ----
  const beginDrag = (e: ReactPointerEvent, kind: 'zoom' | 'trim', item: ZoomEvent | TrimRange, mode: DragKind) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    select({ kind, id: item.id })
    dragRef.current = { kind, id: item.id, mode, originX: e.clientX, start: item.start, end: item.end }
  }
  const onDragMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dt = (e.clientX - d.originX) / pxPerSecond
    let start = d.start
    let end = d.end
    const floor = Math.min(0.3, d.end - d.start)
    // Cuts may not be dragged into a neighbouring cut (that would merge them mid-gesture).
    let lo = 0
    let hi = duration
    if (d.kind === 'trim') {
      for (const t of project.trims) {
        if (t.id === d.id) continue
        if (t.end <= d.start + 1e-6) lo = Math.max(lo, t.end + 0.05)
        if (t.start >= d.end - 1e-6) hi = Math.min(hi, t.start - 0.05)
      }
    }
    if (d.mode === 'move') {
      const len = d.end - d.start
      start = Math.max(lo, Math.min(hi - len, d.start + dt))
      end = start + len
    } else if (d.mode === 'start') {
      start = Math.max(lo, Math.min(d.end - floor, d.start + dt))
    } else {
      end = Math.min(hi, Math.max(d.start + floor, d.end + dt))
    }
    const key = `drag-${d.kind}-${d.id}`
    if (d.kind === 'zoom') apply((p) => updateZoom(p, d.id, { start, end }), key)
    else apply((p) => updateTrim(p, d.id, { start, end }), key)
  }
  const endDrag = () => {
    if (dragRef.current) useEditor.getState().endGesture()
    dragRef.current = null
  }

  const addZoomAtPlayhead = () => {
    const { project: p, zoom } = addManualZoom(project, time, !!track)
    apply(() => p)
    select({ kind: 'zoom', id: zoom.id })
  }

  const cutAtPlayhead = () => {
    const start = Math.max(0, Math.min(duration - 0.5, time))
    const end = Math.min(duration, start + Math.min(2, duration / 4))
    const next = addTrim(project, start, end)
    apply(() => next)
    const created = next.trims.find((t) => t.start <= start + 1e-6 && t.end >= end - 1e-6)
    if (created) select({ kind: 'trim', id: created.id })
  }

  const step = tickStep(pxPerSecond)
  const ticks: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t)

  return (
    <div className="ff-rise mx-6 mb-4 flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-soft)]" data-testid="timeline">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-3">
        <span className="font-display px-1 text-[19px] leading-none">Timeline</span>
        <span className="text-[11.5px] text-ink-3">Source time · {segments.length > 1 ? `${segments.length - 1} cut${segments.length > 2 ? 's' : ''}` : 'no cuts'}</span>
        <div className="mx-2 h-5 w-px bg-line" />
        <Button size="sm" variant="ghost" onClick={addZoomAtPlayhead} data-testid="add-zoom" title="Add a Moment at the playhead (Z)">
          <Plus size={13} /> Moment <Kbd>Z</Kbd>
        </Button>
        <Button size="sm" variant="ghost" onClick={cutAtPlayhead} data-testid="add-cut" title="Cut a section at the playhead (C)">
          <Scissors size={13} /> Cut <Kbd>C</Kbd>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Zoom timeline out" disabled={scale <= 1} onClick={() => setScale((s) => Math.max(1, s / 1.5))}>
            <ZoomOut size={15} />
          </IconButton>
          <IconButton label="Zoom timeline in" disabled={scale >= 12} onClick={() => setScale((s) => Math.min(12, s * 1.5))}>
            <ZoomIn size={15} />
          </IconButton>
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden" onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative" style={{ width: contentWidth + LABEL_WIDTH + 24, minHeight: '100%' }}>
          {/* Ruler */}
          <div className="sticky left-0 flex h-6">
            <div style={{ width: LABEL_WIDTH }} className="shrink-0 bg-surface" />
            <div className="relative cursor-text" style={{ width: contentWidth }} onPointerDown={onScrubDown} data-testid="timeline-ruler">
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-line" style={{ left: x(t) }}>
                  <span className="ml-1 font-mono text-[10px] text-ink-3">{formatTime(t, step < 1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Video track */}
          <Row label="Video">
            <div className="relative h-full cursor-text" style={{ width: contentWidth }} onPointerDown={onScrubDown}>
              <div className="absolute inset-y-1.5 left-0 right-0 overflow-hidden rounded-[8px] bg-sunk">
                {track?.clicks.map((c, i) => (
                  <span key={i} title="Click" className="absolute bottom-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ink-3" style={{ left: x(c.t) }} />
                ))}
              </div>
              {project.trims.map((t) => (
                <Block
                  key={t.id}
                  testId={`trim-${t.id}`}
                  left={x(t.start)}
                  width={x(t.end) - x(t.start)}
                  selected={selection?.kind === 'trim' && selection.id === t.id}
                  className="bg-[repeating-linear-gradient(135deg,rgba(231,169,154,0.55)_0_6px,rgba(231,169,154,0.25)_6px_12px)] ring-coral"
                  label="Cut"
                  onPointerDown={(e, mode) => beginDrag(e, 'trim', t, mode)}
                />
              ))}
            </div>
          </Row>

          {/* Zoom track */}
          <Row label="Moments">
            <div
              className="relative h-full"
              style={{ width: contentWidth }}
              onDoubleClick={(e) => {
                if (e.target !== e.currentTarget) return
                const t = timeFromEvent(e, e.currentTarget)
                const { project: p, zoom } = addManualZoom(project, t, !!track)
                apply(() => p)
                select({ kind: 'zoom', id: zoom.id })
              }}
            >
              {project.zooms.length === 0 && (
                <div className="pointer-events-none absolute inset-y-1 left-2 flex items-center text-[11.5px] text-ink-3">Double-click to add a Moment</div>
              )}
              {project.zooms.map((z) => (
                <Block
                  key={z.id}
                  testId={`zoom-${z.id}`}
                  left={x(z.start)}
                  width={x(z.end) - x(z.start)}
                  selected={selection?.kind === 'zoom' && selection.id === z.id}
                  className={clsx(z.disabled ? 'bg-sunk-2 text-ink-2 ring-line' : z.origin === 'auto' ? 'bg-lavender-soft ring-lavender/70' : 'bg-lavender/55 ring-lavender-ink/60')}
                  label={`${z.label ? `${z.label} · ` : z.origin === 'auto' ? 'Auto ' : ''}${z.disabled ? 'off' : `${z.scale.toFixed(1)}×`}`}
                  onPointerDown={(e, mode) => beginDrag(e, 'zoom', z, mode)}
                />
              ))}
            </div>
          </Row>

          {/* Playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-[1.5px] bg-coral-ink" style={{ left: LABEL_WIDTH + x(time) }} data-testid="playhead">
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5.5px] border-t-[7px] border-x-transparent border-t-coral-ink" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-stretch">
      <div className="sticky left-0 z-10 flex shrink-0 items-center bg-surface pl-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2" style={{ width: LABEL_WIDTH }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Block({
  left,
  width,
  selected,
  className,
  label,
  testId,
  onPointerDown,
}: {
  left: number
  width: number
  selected: boolean
  className: string
  label: string
  testId: string
  onPointerDown: (e: ReactPointerEvent, mode: DragKind) => void
}) {
  return (
    <div
      data-testid={testId}
      className={clsx('absolute inset-y-1.5 z-10 cursor-grab rounded-[8px] ring-1 active:cursor-grabbing', className, selected && 'ring-2 ring-ink')}
      style={{ left, width: Math.max(4, width) }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-2 text-[11px] font-medium text-ink">{width > 34 ? label : ''}</span>
      <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-[8px] hover:bg-ink/15" onPointerDown={(e) => onPointerDown(e, 'start')} data-testid={`${testId}-start`} />
      <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-[8px] hover:bg-ink/15" onPointerDown={(e) => onPointerDown(e, 'end')} data-testid={`${testId}-end`} />
    </div>
  )
}

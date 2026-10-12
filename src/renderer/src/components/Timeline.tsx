import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Pause, Play, Plus, Scissors, ZoomIn, ZoomOut } from 'lucide-react'
import { clsx } from 'clsx'
import type { Project, TrimRange, ZoomEvent } from '@shared/project'
import { addManualZoom, addTrim, updateTrim, updateZoom } from '@shared/projectModel'
import { keptSegments, outputDuration, sourceToOutput } from '@shared/engine/timeline'
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
  const playing = usePlayhead((s) => s.playing)
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
  const outDur = outputDuration(segments)

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
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
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
    if (d.mode === 'move') {
      const len = d.end - d.start
      start = Math.max(0, Math.min(duration - len, d.start + dt))
      end = start + len
    } else if (d.mode === 'start') {
      start = Math.max(0, Math.min(d.end - 0.3, d.start + dt))
    } else {
      end = Math.min(duration, Math.max(d.start + 0.3, d.end + dt))
    }
    const key = `drag-${d.kind}-${d.id}`
    if (d.kind === 'zoom') apply((p) => updateZoom(p, d.id, { start, end }), key)
    else apply((p) => updateTrim(p, d.id, { start, end }), key)
  }
  const endDrag = () => {
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
    <div className="flex h-full flex-col border-t border-line bg-panel" data-testid="timeline">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <IconButton label={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => playback.toggle()} data-testid="timeline-play">
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </IconButton>
        <div className="font-mono text-[12px] tabular-nums text-muted" data-testid="timecode">
          <span className="text-fg">{formatTime(sourceToOutput(segments, time), true)}</span> / {formatTime(outDur, true)}
        </div>
        <div className="mx-2 h-5 w-px bg-line" />
        <Button size="sm" variant="ghost" onClick={addZoomAtPlayhead} data-testid="add-zoom" title="Add zoom at playhead (Z)">
          <Plus size={13} /> Zoom <Kbd>Z</Kbd>
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
            <div style={{ width: LABEL_WIDTH }} className="shrink-0 bg-panel" />
            <div className="relative cursor-text" style={{ width: contentWidth }} onPointerDown={onScrubDown} data-testid="timeline-ruler">
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-line" style={{ left: x(t) }}>
                  <span className="ml-1 font-mono text-[10px] text-subtle">{formatTime(t, step < 1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Video track */}
          <Row label="Video">
            <div className="relative h-full cursor-text" style={{ width: contentWidth }} onPointerDown={onScrubDown}>
              <div className="absolute inset-y-1 left-0 right-0 overflow-hidden rounded-md bg-gradient-to-b from-[#2b2f3d] to-[#232633] ring-1 ring-white/10">
                {track?.clicks.map((c, i) => (
                  <span key={i} title="Click" className="absolute bottom-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/50" style={{ left: x(c.t) }} />
                ))}
              </div>
              {project.trims.map((t) => (
                <Block
                  key={t.id}
                  testId={`trim-${t.id}`}
                  left={x(t.start)}
                  width={x(t.end) - x(t.start)}
                  selected={selection?.kind === 'trim' && selection.id === t.id}
                  className="bg-[repeating-linear-gradient(135deg,rgba(255,138,92,0.35)_0_6px,rgba(255,138,92,0.15)_6px_12px)] ring-trim"
                  label="Cut"
                  onPointerDown={(e, mode) => beginDrag(e, 'trim', t, mode)}
                />
              ))}
            </div>
          </Row>

          {/* Zoom track */}
          <Row label="Zoom">
            <div
              className="relative h-full"
              style={{ width: contentWidth }}
              onDoubleClick={(e) => {
                const t = timeFromEvent(e, e.currentTarget)
                const { project: p, zoom } = addManualZoom(project, t, !!track)
                apply(() => p)
                select({ kind: 'zoom', id: zoom.id })
              }}
            >
              {project.zooms.length === 0 && (
                <div className="pointer-events-none absolute inset-y-1 left-2 flex items-center text-[11px] text-subtle">Double-click to add a zoom</div>
              )}
              {project.zooms.map((z) => (
                <Block
                  key={z.id}
                  testId={`zoom-${z.id}`}
                  left={x(z.start)}
                  width={x(z.end) - x(z.start)}
                  selected={selection?.kind === 'zoom' && selection.id === z.id}
                  className={clsx(z.origin === 'auto' ? 'bg-zoom/25 ring-zoom/60 [background-image:linear-gradient(90deg,rgba(139,123,255,0.15),rgba(139,123,255,0.35))]' : 'bg-zoom/45 ring-zoom')}
                  label={`${z.origin === 'auto' ? 'Auto ' : ''}${z.scale.toFixed(1)}×`}
                  onPointerDown={(e, mode) => beginDrag(e, 'zoom', z, mode)}
                />
              ))}
            </div>
          </Row>

          {/* Playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-white" style={{ left: LABEL_WIDTH + x(time) }} data-testid="playhead">
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-stretch border-b border-line/60">
      <div className="sticky left-0 z-10 flex shrink-0 items-center bg-panel pl-3 text-[11px] font-medium text-subtle" style={{ width: LABEL_WIDTH }}>
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
      className={clsx('absolute inset-y-1 z-10 cursor-grab rounded-md ring-1 active:cursor-grabbing', className, selected && 'ring-2 ring-white')}
      style={{ left, width: Math.max(4, width) }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-2 text-[11px] font-medium text-white/90">{width > 34 ? label : ''}</span>
      <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/30" onPointerDown={(e) => onPointerDown(e, 'start')} data-testid={`${testId}-start`} />
      <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/30" onPointerDown={(e) => onPointerDown(e, 'end')} data-testid={`${testId}-end`} />
    </div>
  )
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Crosshair, MousePointer2, Trash2, Undo2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { EasingId, TrimRange, ZoomEvent } from '@shared/project'
import { removeTrim, removeZoom, updateTrim, updateZoom } from '@shared/projectModel'
import { useEditor } from '../state/editorStore'
import { playback, usePlayhead } from '../state/playhead'
import { formatTime } from '../lib/format'
import { AutoZoomPicker, BackgroundPicker, CursorControls, FormatPicker, FrameControls, StylePicker } from './controls'
import { Button, Section, Segmented, Slider } from './ui'

type Tab = 'look' | 'zoom' | 'cursor'

export function Inspector() {
  const selection = useEditor((s) => s.selection)
  const project = useEditor((s) => s.project)
  const [tab, setTab] = useState<Tab>('look')
  if (!project) return null
  const zoom = selection?.kind === 'zoom' ? project.zooms.find((z) => z.id === selection.id) : undefined
  const trim = selection?.kind === 'trim' ? project.trims.find((t) => t.id === selection.id) : undefined

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-panel" data-testid="inspector">
      {zoom ? (
        <ZoomInspector zoom={zoom} />
      ) : trim ? (
        <TrimInspector trim={trim} />
      ) : (
        <>
          <div className="border-b border-line p-3">
            <Segmented<Tab>
              label="Inspector"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'look', label: 'Look' },
                { value: 'zoom', label: 'Zoom' },
                { value: 'cursor', label: 'Cursor' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'look' && (
              <>
                <Section title="Style"><StylePicker compact /></Section>
                <Section title="Format"><FormatPicker includeClassic /></Section>
                <Section title="Background"><BackgroundPicker /></Section>
                <Section title="Frame"><FrameControls /></Section>
              </>
            )}
            {tab === 'zoom' && (
              <>
                <Section title="Automatic zoom"><AutoZoomPicker /></Section>
                <Section title={`Zooms (${project.zooms.length})`}><ZoomList zooms={project.zooms} /></Section>
              </>
            )}
            {tab === 'cursor' && <Section title="Cursor"><CursorControls /></Section>}
          </div>
        </>
      )}
    </aside>
  )
}

function ZoomList({ zooms }: { zooms: ZoomEvent[] }) {
  const select = useEditor((s) => s.select)
  if (zooms.length === 0) return <p className="text-[12px] text-subtle">No zooms yet. Press <b>Z</b> or double-click the zoom track to add one.</p>
  return (
    <ul className="space-y-1">
      {zooms.map((z) => (
        <li key={z.id}>
          <button
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-white/5"
            onClick={() => {
              select({ kind: 'zoom', id: z.id })
              playback.seek(z.start + Math.min(z.transition, (z.end - z.start) / 2))
            }}
          >
            <span className="font-mono text-muted">{formatTime(z.start, true)} – {formatTime(z.end, true)}</span>
            <span className="flex items-center gap-2">
              <span className={clsx('rounded px-1.5 py-0.5 text-[10px]', z.origin === 'auto' ? 'bg-zoom/20 text-[#c1b8ff]' : 'bg-white/10 text-fg')}>{z.origin === 'auto' ? 'Auto' : 'Manual'}</span>
              <span className="w-9 text-right font-mono">{z.scale.toFixed(1)}×</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

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
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center rounded-lg bg-black/30 ring-1 ring-line focus-within:ring-accent">
        <input
          aria-label={label}
          className="w-full bg-transparent px-2.5 py-1.5 font-mono text-[12px] outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="pr-2.5 text-[11px] text-subtle">s</span>
      </div>
    </label>
  )
}

function ZoomInspector({ zoom }: { zoom: ZoomEvent }) {
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const duration = useEditor((s) => s.project?.media.duration ?? 0)
  const hasCursor = useEditor((s) => !!s.track && s.track.samples.length > 0)
  const set = (patch: Partial<ZoomEvent>, key?: string) => apply((p) => updateZoom(p, zoom.id, patch), key)
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="zoom-inspector">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold">Zoom</div>
          <div className="text-[11px] text-subtle">{zoom.origin === 'auto' ? 'Automatic — edit to make it yours' : 'Manual'}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => select(null)}>Done</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Amount">
          <Slider label="Zoom level" value={zoom.scale} min={1.1} max={4} step={0.05} onChange={(scale) => set({ scale }, `zoom-scale-${zoom.id}`)} format={(v) => `${v.toFixed(2)}×`} />
        </Section>
        <Section title="Focus">
          <Segmented
            label="Focus mode"
            value={zoom.focus.mode}
            onChange={(mode) => set(mode === 'cursor' ? { focus: { mode: 'cursor' } } : { focus: { mode: 'fixed', x: 0.5, y: 0.5 } })}
            options={[
              { value: 'cursor', label: <><MousePointer2 size={12} /> Follow cursor</>, title: hasCursor ? undefined : 'No cursor data — will stay centered' },
              { value: 'fixed', label: <><Crosshair size={12} /> Fixed point</> },
            ]}
          />
          {zoom.focus.mode === 'fixed' && <FocusPicker x={zoom.focus.x} y={zoom.focus.y} onChange={(x, y) => set({ focus: { mode: 'fixed', x, y } }, `zoom-focus-${zoom.id}`)} />}
        </Section>
        <Section title="Timing">
          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Start" value={zoom.start} min={0} max={duration} onChange={(start) => set({ start })} />
            <TimeField label="End" value={zoom.end} min={0} max={duration} onChange={(end) => set({ end })} />
          </div>
          <Slider label="Transition" value={zoom.transition} min={0.1} max={2} step={0.05} onChange={(transition) => set({ transition }, `zoom-tr-${zoom.id}`)} format={(v) => `${v.toFixed(2)}s`} />
          <div>
            <div className="mb-1.5 text-xs text-muted">Easing</div>
            <Segmented<EasingId> label="Easing" value={zoom.easing} onChange={(easing) => set({ easing })} options={[{ value: 'smooth', label: 'Smooth' }, { value: 'snappy', label: 'Snappy' }, { value: 'linear', label: 'Linear' }]} />
          </div>
        </Section>
        <div className="p-4">
          <Button
            variant="danger"
            className="w-full"
            data-testid="delete-zoom"
            onClick={() => {
              apply((p) => removeZoom(p, zoom.id))
              select(null)
            }}
          >
            <Trash2 size={14} /> Delete Zoom
          </Button>
        </div>
      </div>
    </div>
  )
}

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
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }, [time])

  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)))
  }
  return (
    <div>
      <div
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg ring-1 ring-line"
        style={{ aspectRatio: `${aspect}` }}
        data-testid="focus-picker"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
      >
        <canvas ref={canvasRef} width={480} height={Math.round(480 / aspect)} className="h-full w-full opacity-80" />
        <div className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-subtle">Click or drag to choose what the zoom centers on. Showing the frame at the playhead.</p>
    </div>
  )
}

function TrimInspector({ trim }: { trim: TrimRange }) {
  const apply = useEditor((s) => s.apply)
  const select = useEditor((s) => s.select)
  const duration = useEditor((s) => s.project?.media.duration ?? 0)
  const set = (patch: Partial<TrimRange>) => apply((p) => updateTrim(p, trim.id, patch))
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="trim-inspector">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold">Cut section</div>
          <div className="text-[11px] text-subtle">{formatTime(trim.end - trim.start, true)} removed from the video</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => select(null)}>Done</Button>
      </div>
      <Section title="Range">
        <div className="grid grid-cols-2 gap-2">
          <TimeField label="Start" value={trim.start} min={0} max={duration} onChange={(start) => set({ start })} />
          <TimeField label="End" value={trim.end} min={0} max={duration} onChange={(end) => set({ end })} />
        </div>
      </Section>
      <div className="p-4">
        <Button
          className="w-full"
          data-testid="delete-trim"
          onClick={() => {
            apply((p) => removeTrim(p, trim.id))
            select(null)
          }}
        >
          <Undo2 size={14} /> Restore Section
        </Button>
      </div>
    </div>
  )
}

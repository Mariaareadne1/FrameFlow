import type { ReactNode } from 'react'
import { Check, Monitor, RectangleVertical, Square } from 'lucide-react'
import { clsx } from 'clsx'
import type { AspectRatio, AutoZoomLevel, Background, StylePresetId } from '@shared/project'
import { BACKGROUND_PRESETS, SOLID_COLORS, STYLE_PRESETS, resolveBackground, type BackgroundPreset } from '@shared/styles'
import { applyStyle, setAutoZoom } from '@shared/projectModel'
import { useEditor } from '../state/editorStore'
import { Segmented, Slider, Toggle } from './ui'

/** CSS approximation of a background preset, for swatches only (rendering uses canvas). */
export function backgroundCss(p: BackgroundPreset): string {
  const layers = p.layers
    .slice()
    .reverse()
    .map((l) =>
      l.type === 'linear'
        ? `linear-gradient(${l.angle}deg, ${l.stops.map(([o, c]) => `${c} ${o * 100}%`).join(', ')})`
        : `radial-gradient(circle at ${l.x * 100}% ${l.y * 100}%, ${l.color}, transparent ${l.radius * 100}%)`,
    )
  return [...layers, p.base].join(', ')
}

export function StylePicker({ compact = false }: { compact?: boolean }) {
  const style = useEditor((s) => s.project?.style)
  const apply = useEditor((s) => s.apply)
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Style">
      {STYLE_PRESETS.map((p) => {
        const bg = resolveBackground(p.background)
        const active = style === p.id
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={active}
            data-testid={`style-${p.id}`}
            onClick={() => apply((proj) => applyStyle(proj, p.id as StylePresetId))}
            className={clsx('group overflow-hidden rounded-xl text-left ring-1 transition', active ? 'ring-2 ring-accent' : 'ring-line hover:ring-line-strong')}
          >
            <div className="relative flex aspect-[4/3] items-center justify-center" style={{ background: backgroundCss(bg) }}>
              <div
                className="bg-white/90"
                style={{
                  width: `${100 - p.frame.padding * 260}%`,
                  height: `${100 - p.frame.padding * 340}%`,
                  borderRadius: p.frame.radius / 4,
                  boxShadow: `0 ${6 * p.frame.shadow}px ${16 * p.frame.shadow}px rgba(0,0,0,${0.45 * p.frame.shadow})`,
                }}
              />
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[12px] font-medium">{p.name}</div>
              {!compact && <div className="truncate text-[10.5px] text-subtle">{p.description}</div>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function AutoZoomPicker() {
  const level = useEditor((s) => s.project?.autoZoom ?? 'off')
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const hasCursor = !!track && track.samples.length > 0
  return (
    <div>
      <Segmented<AutoZoomLevel>
        label="Automatic zoom"
        value={level}
        onChange={(v) => apply((p) => setAutoZoom(p, v, track))}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'subtle', label: 'Subtle', title: hasCursor ? undefined : 'Needs cursor data from a FrameFlow recording' },
          { value: 'dynamic', label: 'Dynamic', title: hasCursor ? undefined : 'Needs cursor data from a FrameFlow recording' },
        ]}
      />
      {!hasCursor && <p className="mt-2 text-[11px] leading-snug text-subtle">This video has no cursor data, so zooms can only be added by hand.</p>}
    </div>
  )
}

export function BackgroundPicker({ showSolids = true }: { showSolids?: boolean }) {
  const bg = useEditor((s) => s.project?.background)
  const apply = useEditor((s) => s.apply)
  const set = (background: Background) => apply((p) => ({ ...p, background }))
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background">
        {BACKGROUND_PRESETS.map((p) => {
          const active = bg?.kind === 'preset' && bg.presetId === p.id
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={active}
              aria-label={p.name}
              title={p.name}
              data-testid={`bg-${p.id}`}
              onClick={() => set({ kind: 'preset', presetId: p.id })}
              className={clsx('relative aspect-square rounded-lg ring-1 transition', active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : 'ring-white/10 hover:ring-white/30')}
              style={{ background: backgroundCss(p) }}
            >
              {active && <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow" />}
            </button>
          )
        })}
      </div>
      {showSolids && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Solid color">
          {SOLID_COLORS.map((c) => {
            const active = bg?.kind === 'solid' && bg.color.toLowerCase() === c.toLowerCase()
            return (
              <button
                key={c}
                role="radio"
                aria-checked={active}
                aria-label={`Solid ${c}`}
                onClick={() => set({ kind: 'solid', color: c })}
                className={clsx('h-6 w-6 rounded-full ring-1 transition', active ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : 'ring-white/15 hover:ring-white/40')}
                style={{ background: c }}
              />
            )
          })}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/15" title="Custom color" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input
              type="color"
              aria-label="Custom color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={bg?.kind === 'solid' ? bg.color : '#1f2430'}
              onChange={(e) => useEditor.getState().apply((p) => ({ ...p, background: { kind: 'solid', color: e.target.value } }), 'bg-custom')}
            />
          </label>
        </div>
      )}
    </div>
  )
}

const FORMAT_OPTIONS: ReadonlyArray<{ value: AspectRatio; label: ReactNode; title: string }> = [
  { value: '16:9', label: <><Monitor size={13} /> 16:9</>, title: 'Landscape' },
  { value: '9:16', label: <><RectangleVertical size={13} /> 9:16</>, title: 'Portrait' },
  { value: '1:1', label: <><Square size={13} /> 1:1</>, title: 'Square' },
]

export function FormatPicker({ includeClassic = false }: { includeClassic?: boolean }) {
  const aspect = useEditor((s) => s.project?.aspectRatio ?? '16:9')
  const apply = useEditor((s) => s.apply)
  const options = includeClassic ? [...FORMAT_OPTIONS, { value: '4:3' as const, label: '4:3', title: 'Classic' }] : FORMAT_OPTIONS
  return <Segmented<AspectRatio> label="Format" value={aspect} onChange={(v) => apply((p) => ({ ...p, aspectRatio: v }))} options={options} />
}

export function FrameControls() {
  const frame = useEditor((s) => s.project?.frame)
  const apply = useEditor((s) => s.apply)
  if (!frame) return null
  const set = (patch: Partial<typeof frame>, key: string) => apply((p) => ({ ...p, frame: { ...p.frame, ...patch } }), key)
  return (
    <>
      <Slider label="Padding" value={frame.padding} min={0} max={0.3} step={0.005} onChange={(padding) => set({ padding }, 'frame-padding')} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Corner radius" value={frame.radius} min={0} max={60} step={1} onChange={(radius) => set({ radius }, 'frame-radius')} format={(v) => `${Math.round(v)}px`} />
      <Slider label="Shadow" value={frame.shadow} min={0} max={1} step={0.01} onChange={(shadow) => set({ shadow }, 'frame-shadow')} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Scale" value={frame.scale} min={0.5} max={1} step={0.01} onChange={(scale) => set({ scale }, 'frame-scale')} format={(v) => `${Math.round(v * 100)}%`} />
    </>
  )
}

export function CursorControls() {
  const cursor = useEditor((s) => s.project?.cursor)
  const embedded = useEditor((s) => s.project?.media.cursorEmbedded)
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  if (!cursor) return null
  if (embedded || !track) {
    return <p className="text-[12px] leading-relaxed text-subtle">The cursor is part of this video's pixels, so it can't be restyled. Record with FrameFlow to get a smooth, adjustable cursor.</p>
  }
  const set = (patch: Partial<typeof cursor>, key?: string) => apply((p) => ({ ...p, cursor: { ...p.cursor, ...patch } }), key)
  return (
    <>
      <Toggle label="Show cursor" checked={cursor.visible} onChange={(visible) => set({ visible })} />
      <Slider label="Size" value={cursor.size} min={0.5} max={3} step={0.05} onChange={(size) => set({ size }, 'cursor-size')} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Smoothing" value={cursor.smoothing} min={0} max={1} step={0.01} onChange={(smoothing) => set({ smoothing }, 'cursor-smoothing')} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Click effect" description="A soft ripple on every click" checked={cursor.clickEffect} onChange={(clickEffect) => set({ clickEffect })} />
    </>
  )
}

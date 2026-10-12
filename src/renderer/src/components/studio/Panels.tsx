import { useMemo, type ReactNode } from 'react'
import { Check, Info, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { AspectRatio, Background, CameraFeel, CursorEffect, Project } from '@shared/project'
import { CLASSIC_BACKGROUNDS, SIGNATURE_BACKGROUNDS, SOLID_COLORS, STYLE_PRESETS, styleName, type BackgroundPreset } from '@shared/styles'
import { applyStyle, customizeLook, setCameraFeel, setCursorEffect, tuneCamera } from '@shared/projectModel'
import { useEditor } from '../../state/editorStore'
import { useStudio } from '../../state/studioStore'
import { LiveFrame } from '../LiveFrame'
import { IconButton, Section, Segmented, Slider, Toggle } from '../ui'

/** CSS approximation of a backdrop, for small swatches only (renders use the canvas). */
export function backgroundCss(p: BackgroundPreset): string {
  const layers = p.layers
    .slice()
    .reverse()
    .flatMap((l) =>
      l.type === 'linear'
        ? [`linear-gradient(${l.angle}deg, ${l.stops.map(([o, c]) => `${c} ${o * 100}%`).join(', ')})`]
        : l.type === 'radial'
          ? [`radial-gradient(circle at ${l.x * 100}% ${l.y * 100}%, ${l.color}, transparent ${l.radius * 100}%)`]
          : l.type === 'vignette'
            ? [`radial-gradient(circle, transparent ${l.inner * 70}%, ${l.color} 100%)`]
            : [],
    )
  return [...layers, p.base].join(', ')
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const close = useStudio((s) => s.closeDrawer)
  const reset = useStudio((s) => s.reset)
  return (
    <div className="flex items-start justify-between px-5 pb-1 pt-5">
      <div>
        <h2 className="font-display text-[30px] leading-none">{title}</h2>
        <p className="mt-1.5 text-[12.5px] text-ink-2">{subtitle}</p>
      </div>
      <IconButton
        label="Close panel"
        onClick={() => {
          close()
          reset('moments')
        }}
      >
        <X size={16} />
      </IconButton>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mx-5 mt-3 flex gap-2.5 rounded-[12px] bg-lavender-soft/70 p-3.5 text-[12px] leading-relaxed text-[#4c3f72]" data-testid="panel-notice">
      <Info size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Design                                                                                 */
/* ------------------------------------------------------------------------------------- */

const FORMATS: ReadonlyArray<{ value: AspectRatio; label: string }> = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
]

export function DesignPanel({ project }: { project: Project }) {
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const variants = useMemo(() => STYLE_PRESETS.map((s) => ({ style: s, project: applyStyle(project, s.id) })), [project])
  const setBackground = (background: Background, key?: string) => apply((p) => customizeLook(p, { background }), key)
  const setFrame = (patch: Partial<Project['frame']>, key: string) => apply((p) => customizeLook(p, { frame: { ...p.frame, ...patch } }), key)
  const isLegacy = project.style === 'clean' || project.style === 'minimal' || project.style === 'colorful'

  const swatch = (p: BackgroundPreset) => {
    const active = project.background.kind === 'preset' && project.background.presetId === p.id
    return (
      <button
        key={p.id}
        role="radio"
        aria-checked={active}
        aria-label={p.name}
        title={p.name}
        data-testid={`bg-${p.id}`}
        onClick={() => setBackground({ kind: 'preset', presetId: p.id })}
        className={clsx('relative aspect-square rounded-[10px] shadow-[inset_0_0_0_1px_rgba(37,38,43,0.08)] transition', active ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-[1.04]')}
        style={{ background: backgroundCss(p) }}
      >
        {active && <Check size={13} strokeWidth={3} className="absolute inset-0 m-auto text-ink mix-blend-difference" />}
      </button>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="design-panel">
      <PanelHeader title="Design" subtitle={`Art direction · ${styleName(project.style)}${isLegacy ? ' (classic)' : ''}`} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Style">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Style">
            {variants.map(({ style, project: v }) => {
              const active = project.style === style.id
              return (
                <button
                  key={style.id}
                  role="radio"
                  aria-checked={active}
                  data-testid={`style-${style.id}`}
                  onClick={() => apply((p) => applyStyle(p, style.id))}
                  className={clsx('group overflow-hidden rounded-[12px] bg-surface text-left transition', active ? 'shadow-[0_0_0_2px_var(--color-ink)]' : 'shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-ink-3)]')}
                >
                  <LiveFrame project={v} track={track} width={136} className="block w-full" testId={`style-preview-${style.id}`} />
                  <div className="px-2.5 py-2">
                    <div className="font-display text-[17px] leading-5">{style.name}</div>
                    <div className="truncate text-[11px] text-ink-2">{style.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </Section>
        <Section title="Format">
          <Segmented<AspectRatio> label="Format" value={project.aspectRatio} onChange={(aspectRatio) => apply((p) => ({ ...p, aspectRatio }))} options={FORMATS} />
        </Section>
        <Section title="Backdrop">
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Signature backdrops">
            {SIGNATURE_BACKGROUNDS.map(swatch)}
          </div>
          <div className="text-[11px] font-medium text-ink-3">Classic gradients</div>
          <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Classic backdrops">
            {CLASSIC_BACKGROUNDS.map(swatch)}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Solid colour">
            {SOLID_COLORS.map((c) => {
              const active = project.background.kind === 'solid' && project.background.color.toLowerCase() === c.toLowerCase()
              return (
                <button
                  key={c}
                  role="radio"
                  aria-checked={active}
                  aria-label={`Solid ${c}`}
                  onClick={() => setBackground({ kind: 'solid', color: c })}
                  className={clsx('h-6 w-6 rounded-full shadow-[inset_0_0_0_1px_rgba(37,38,43,0.12)] transition', active ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110')}
                  style={{ background: c }}
                />
              )
            })}
            <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full" title="Custom colour" style={{ background: 'conic-gradient(#e7a99a, #f3d48b, #a8d5b0, #8db2ec, #aa9acf, #e7a99a)' }}>
              <input
                type="color"
                aria-label="Custom colour"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={project.background.kind === 'solid' ? project.background.color : '#f7f5f0'}
                onChange={(e) => setBackground({ kind: 'solid', color: e.target.value }, 'bg-custom')}
              />
            </label>
          </div>
        </Section>
        <Section title="Frame">
          <Slider label="Padding" value={project.frame.padding} min={0} max={0.3} step={0.005} onChange={(padding) => setFrame({ padding }, 'frame-padding')} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Corners" value={project.frame.radius} min={0} max={60} step={1} onChange={(radius) => setFrame({ radius }, 'frame-radius')} format={(v) => `${Math.round(v)} px`} />
          <Slider label="Shadow" value={project.frame.shadow} min={0} max={1} step={0.01} onChange={(shadow) => setFrame({ shadow }, 'frame-shadow')} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Video scale" value={project.frame.scale} min={0.5} max={1} step={0.01} onChange={(scale) => setFrame({ scale }, 'frame-scale')} format={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Camera                                                                                 */
/* ------------------------------------------------------------------------------------- */

const FEELS: ReadonlyArray<{ id: CameraFeel; name: string; description: string; art: ReactNode }> = [
  {
    id: 'still',
    name: 'Still',
    description: 'No automatic camera',
    art: <rect x="8" y="8" width="64" height="40" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />,
  },
  {
    id: 'calm',
    name: 'Calm',
    description: 'Gentle, steady framing',
    art: (
      <>
        <rect x="8" y="8" width="64" height="40" rx="5" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
        <rect x="20" y="15" width="40" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      </>
    ),
  },
  {
    id: 'follow',
    name: 'Follow',
    description: 'Glides with your cursor',
    art: (
      <>
        <rect x="8" y="8" width="64" height="40" rx="5" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
        <path d="M18 40 C 30 40, 34 18, 56 18" fill="none" stroke="#AA9ACF" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1 4" />
        <rect x="42" y="10" width="26" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      </>
    ),
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'Bold zooms on clicks',
    art: (
      <>
        <rect x="8" y="8" width="64" height="40" rx="5" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
        <rect x="30" y="19" width="20" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="40" cy="25.5" r="2.5" fill="#E7A99A" />
      </>
    ),
  },
]

export function CameraPanel({ project }: { project: Project }) {
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const hasTrack = !!track && track.samples.length > 0
  const cam = project.camera
  const edited = project.zooms.filter((z) => z.origin === 'manual').length
  const follows = cam.feel === 'follow' || project.zooms.some((z) => z.focus.mode === 'cursor' && !z.disabled)
  const tune = (patch: Partial<Project['camera']>, key: string) => apply((p) => tuneCamera(p, patch, track), key)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="camera-panel">
      <PanelHeader title="Camera" subtitle={`${project.zooms.length} ${project.zooms.length === 1 ? 'Moment' : 'Moments'}${edited ? ` · ${edited} edited by you` : ''}`} />
      {!hasTrack && <Notice>This video has no cursor data, so automatic camera moves aren’t available. Add Moments by hand from the Moments tab — framing, zoom and timing all still work.</Notice>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Camera feel" description="Edited Moments are always kept when you change the feel.">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Camera feel">
            {FEELS.map((f) => {
              const active = cam.feel === f.id
              const disabled = !hasTrack && f.id !== 'still'
              return (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  data-testid={`feel-${f.id}`}
                  onClick={() => apply((p) => setCameraFeel(p, f.id, track))}
                  className={clsx(
                    'rounded-[12px] p-3 text-left transition disabled:opacity-40',
                    active ? 'bg-ink text-paper' : 'bg-sunk text-ink hover:bg-sunk-2',
                  )}
                >
                  <svg viewBox="0 0 80 56" className="h-12 w-full">{f.art}</svg>
                  <div className="font-display mt-1 text-[18px] leading-5">{f.name}</div>
                  <div className={clsx('text-[11px]', active ? 'text-paper/70' : 'text-ink-2')}>{f.description}</div>
                </button>
              )
            })}
          </div>
        </Section>
        {hasTrack && cam.feel !== 'still' && (
          <Section title="Fine-tune">
            <Slider label="Zoom intensity" value={cam.intensity} min={0.5} max={1.5} step={0.05} onChange={(intensity) => tune({ intensity }, 'cam-intensity')} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Motion speed" value={cam.speed} min={0.5} max={1.5} step={0.05} onChange={(speed) => tune({ speed }, 'cam-speed')} format={(v) => (v < 0.85 ? 'Slower' : v > 1.15 ? 'Quicker' : 'Natural')} />
            <Slider label="Transition softness" value={cam.softness} min={0} max={1} step={0.05} onChange={(softness) => tune({ softness }, 'cam-softness')} format={(v) => (v >= 0.5 ? 'Glide' : 'Crisp')} />
          </Section>
        )}
        {hasTrack && follows && (
          <Section title="Following the cursor">
            <Slider label="Follow smoothing" value={cam.followSmoothing} min={0} max={1} step={0.05} onChange={(followSmoothing) => tune({ followSmoothing }, 'cam-follow')} format={(v) => `${(0.15 + v * 0.6).toFixed(2)} s`} hint="How lazily the camera trails the cursor." />
            <Slider label="Steadiness" value={cam.deadzone} min={0} max={0.12} step={0.005} onChange={(deadzone) => tune({ deadzone }, 'cam-deadzone')} format={(v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)} hint="Small hand movements inside this radius don’t move the camera." />
          </Section>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Cursor                                                                                 */
/* ------------------------------------------------------------------------------------- */

const ARROW = 'M0 0 L0 23.5 L5.6 18.2 L9.4 27.2 L13.4 25.5 L9.7 16.7 L17.2 16.7 Z'

function Pointer({ x, y }: { x: number; y: number }) {
  return <path d={ARROW} transform={`translate(${x} ${y}) scale(0.62)`} fill="#fff" stroke="#25262B" strokeWidth="1.6" strokeLinejoin="round" />
}

const TREATMENTS: ReadonlyArray<{ id: CursorEffect; name: string; description: string; art: ReactNode }> = [
  { id: 'natural', name: 'Natural', description: 'Just the pointer', art: <Pointer x={36} y={16} /> },
  {
    id: 'halo',
    name: 'Halo',
    description: 'A soft ring of light',
    art: (
      <>
        <circle cx="38" cy="18" r="13" fill="#AA9ACF" fillOpacity=".35" />
        <circle cx="38" cy="18" r="10" fill="none" stroke="#fff" strokeWidth="1.5" />
        <Pointer x={38} y={18} />
      </>
    ),
  },
  {
    id: 'spotlight',
    name: 'Spotlight',
    description: 'Quiets the rest on click',
    art: (
      <>
        <defs>
          <radialGradient id="ff-spot" cx="0.47" cy="0.5" r="0.6">
            <stop offset="0.35" stopColor="#25262B" stopOpacity="0" />
            <stop offset="1" stopColor="#25262B" stopOpacity=".35" />
          </radialGradient>
        </defs>
        <rect x="4" y="2" width="72" height="52" rx="6" fill="url(#ff-spot)" />
        <Pointer x={36} y={22} />
      </>
    ),
  },
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'A ripple on each click',
    art: (
      <>
        <circle cx="36" cy="22" r="16" fill="none" stroke="#AA9ACF" strokeOpacity=".45" strokeWidth="1.5" />
        <circle cx="36" cy="22" r="9" fill="#8db2ec" fillOpacity=".25" stroke="#fff" strokeWidth="1.5" />
        <Pointer x={36} y={22} />
      </>
    ),
  },
]

export function CursorPanel({ project }: { project: Project }) {
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const available = !!track && track.samples.length > 0 && !project.media.cursorEmbedded
  const cur = project.cursor
  const set = (patch: Partial<Project['cursor']>, key?: string) => apply((p) => ({ ...p, cursor: { ...p.cursor, ...patch } }), key)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="cursor-panel">
      <PanelHeader title="Cursor" subtitle="A recognisable pointer, rendered into the video." />
      {!available ? (
        <Notice>
          The cursor in this video is part of its pixels, so FrameFlow can’t restyle it — and won’t draw a second one on top. Record with FrameFlow to get a smooth, styled cursor.
        </Notice>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Personality">
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Cursor treatment">
              {TREATMENTS.map((t) => {
                const active = cur.effect === t.id
                return (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={active}
                    data-testid={`cursor-${t.id}`}
                    onClick={() => apply((p) => setCursorEffect(p, t.id))}
                    className={clsx('rounded-[12px] p-3 text-left transition', active ? 'bg-ink text-paper' : 'bg-sunk text-ink hover:bg-sunk-2')}
                  >
                    <svg viewBox="0 0 80 56" className={clsx('h-12 w-full rounded-md', active ? 'bg-paper/95' : 'bg-surface')}>
                      {t.art}
                    </svg>
                    <div className="font-display mt-1.5 text-[18px] leading-5">{t.name}</div>
                    <div className={clsx('text-[11px]', active ? 'text-paper/70' : 'text-ink-2')}>{t.description}</div>
                  </button>
                )
              })}
            </div>
          </Section>
          <Section title="Adjust">
            <Toggle label="Show cursor" checked={cur.visible} onChange={(visible) => set({ visible })} />
            <Slider label="Size" value={cur.size} min={0.5} max={3} step={0.05} onChange={(size) => set({ size }, 'cursor-size')} format={(v) => `${v.toFixed(2)}×`} />
            <Slider label="Motion smoothing" value={cur.smoothing} min={0} max={1} step={0.01} onChange={(smoothing) => set({ smoothing }, 'cursor-smoothing')} format={(v) => `${Math.round(v * 100)}%`} />
            {cur.effect !== 'natural' && (
              <Slider label="Effect intensity" value={cur.effectIntensity} min={0.1} max={1} step={0.05} onChange={(effectIntensity) => set({ effectIntensity }, 'cursor-intensity')} format={(v) => `${Math.round(v * 100)}%`} />
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

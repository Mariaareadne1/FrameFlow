import { SlidersHorizontal } from 'lucide-react'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { playback, usePlayhead } from '../state/playhead'
import { keptSegments, outputDuration, sourceToOutput } from '@shared/engine/timeline'
import { useEditorShortcuts } from '../lib/shortcuts'
import { formatTime } from '../lib/format'
import { Preview } from '../components/Preview'
import { ProjectBar } from '../components/ProjectBar'
import { MissingMedia } from '../components/MissingMedia'
import { AutoZoomPicker, BackgroundPicker, FormatPicker, StylePicker } from '../components/controls'
import { Button, Section } from '../components/ui'
import { Pause, Play } from 'lucide-react'

function Scrubber() {
  const project = useEditor((s) => s.project)!
  const time = usePlayhead((s) => s.time)
  const playing = usePlayhead((s) => s.playing)
  const segments = keptSegments(project.trims, project.media.duration)
  const total = outputDuration(segments)
  const out = sourceToOutput(segments, time)
  return (
    <div className="flex items-center gap-3 px-6 pb-5">
      <button aria-label={playing ? 'Pause' : 'Play'} data-testid="quick-play" onClick={() => playback.toggle()} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-white/90">
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>
      <span className="w-12 text-right font-mono text-[12px] tabular-nums text-muted">{formatTime(out)}</span>
      <div
        className="group relative h-6 flex-1 cursor-pointer"
        data-testid="quick-scrubber"
        onPointerDown={(e) => {
          const el = e.currentTarget
          el.setPointerCapture(e.pointerId)
          const seek = (clientX: number) => {
            const r = el.getBoundingClientRect()
            const k = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
            // Scrub in output time, then map back to the source.
            let acc = k * total
            for (const s of segments) {
              const len = s.end - s.start
              if (acc <= len) return playback.seek(s.start + acc)
              acc -= len
            }
          }
          playback.pause()
          seek(e.clientX)
          el.onpointermove = (ev) => seek(ev.clientX)
          el.onpointerup = () => (el.onpointermove = null)
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${total > 0 ? (out / total) * 100 : 0}%` }} />
        {project.zooms.map((z) => {
          const a = sourceToOutput(segments, z.start)
          const b = sourceToOutput(segments, z.end)
          return <div key={z.id} title="Zoom" className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-zoom/70" style={{ left: `${(a / total) * 100}%`, width: `${((b - a) / total) * 100}%`, marginTop: 6 }} />
        })}
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${total > 0 ? (out / total) * 100 : 0}%` }} />
      </div>
      <span className="w-12 font-mono text-[12px] tabular-nums text-subtle">{formatTime(total)}</span>
    </div>
  )
}

export function QuickDemo() {
  const project = useEditor((s) => s.project)
  const track = useEditor((s) => s.track)
  const mediaMissing = useEditor((s) => s.mediaMissing)
  const setMode = useEditor((s) => s.setMode)
  const navigate = useApp((s) => s.navigate)
  useEditorShortcuts(false)
  if (!project) return null

  return (
    <div className="flex h-full flex-col" data-testid="quick-demo">
      <ProjectBar>
        <Button
          data-testid="open-advanced"
          onClick={() => {
            playback.pause()
            setMode('advanced')
            navigate({ name: 'editor' })
          }}
        >
          <SlidersHorizontal size={14} /> Open in Advanced Editor
        </Button>
      </ProjectBar>
      {mediaMissing ? (
        <MissingMedia />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <Preview project={project} track={track} className="flex-1 p-8" />
            <Scrubber />
          </div>
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-line bg-panel" data-testid="quick-controls">
            <div className="px-4 pb-1 pt-4">
              <p className="text-[12px] leading-relaxed text-muted">
                {project.zooms.length > 0
                  ? `FrameFlow added ${project.zooms.length} zoom${project.zooms.length === 1 ? '' : 's'} where you interacted. Pick a look and export.`
                  : 'Pick a look and export.'}
              </p>
            </div>
            <Section title="Style"><StylePicker /></Section>
            <Section title="Automatic zoom"><AutoZoomPicker /></Section>
            <Section title="Background"><BackgroundPicker showSolids={false} /></Section>
            <Section title="Format"><FormatPicker /></Section>
          </aside>
        </div>
      )}
    </div>
  )
}

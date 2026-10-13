import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, FolderOpen, TriangleAlert } from 'lucide-react'
import type { AspectRatio, ExportSettings } from '@shared/project'
import { outputSize } from '@shared/engine/layout'
import { keptSegments, outputDuration } from '@shared/engine/timeline'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { playback } from '../state/playhead'
import { ExportCancelledError, exportProject, type ExportProgress, type ExportResult } from '../media/exporter'
import { exportGif } from '../media/gifExporter'
import { gifSize } from '@shared/engine/gif'
import { errorMessage, formatTime } from '../lib/format'
import { Sheet } from './Modal'
import { LiveFrame } from './LiveFrame'
import { Button, ProgressBar, Segmented } from './ui'

type Phase = { name: 'setup' } | { name: 'running'; progress: ExportProgress } | { name: 'done'; result: ExportResult } | { name: 'error'; message: string }

const STATUS: Record<ExportProgress['phase'], string> = {
  preparing: 'Preparing your video…',
  rendering: 'Rendering every frame…',
  finalizing: 'Finishing the file…',
  done: 'Done',
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] text-ink-2">{label}</div>
      {children}
    </div>
  )
}

export function ExportDialog() {
  const open = useApp((s) => s.exportOpen)
  const setOpen = useApp((s) => s.setExportOpen)
  const project = useEditor((s) => s.project)
  const track = useEditor((s) => s.track)
  const apply = useEditor((s) => s.apply)
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })
  const [destination, setDestination] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      setPhase({ name: 'setup' })
      setDestination(null)
      playback.pause()
    }
  }, [open])

  if (!project) return null
  const settings = project.export
  const isGif = settings.format === 'gif'
  const size = isGif ? gifSize(project) : outputSize(project.aspectRatio, settings.resolution)
  const duration = outputDuration(keptSegments(project.trims, project.media.duration))
  const setSettings = (patch: Partial<ExportSettings>) => apply((p) => ({ ...p, export: { ...p.export, ...patch } }))
  const running = phase.name === 'running'

  const choose = async (): Promise<string | null> => {
    const dest = await window.frameflow.export.chooseDestination(project.name, settings.format)
    if (dest) setDestination(dest)
    return dest
  }

  const start = async () => {
    const dest = destination ?? (await choose())
    if (!dest) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase({ name: 'running', progress: { phase: 'preparing', fraction: 0, frame: 0, totalFrames: 0 } })
    try {
      const { project: current, track: currentTrack } = useEditor.getState()
      if (!current) throw new Error('No project is open.')
      const run = current.export.format === 'gif' ? exportGif : exportProject
      const result = await run({ project: current, track: currentTrack, destination: dest, signal: controller.signal, onProgress: (progress) => setPhase({ name: 'running', progress }) })
      setPhase({ name: 'done', result })
    } catch (err) {
      if (err instanceof ExportCancelledError) setPhase({ name: 'setup' })
      else setPhase({ name: 'error', message: errorMessage(err) })
      // A destination grant is single-use; ask again next time.
      setDestination(null)
    } finally {
      abortRef.current = null
    }
  }

  const fileName = (p: string) => p.split('/').pop() ?? p

  return (
    <Sheet
      open={open}
      onClose={() => !running && setOpen(false)}
      title={phase.name === 'done' ? 'Ready to share' : phase.name === 'running' ? 'Exporting' : 'Export'}
      subtitle={phase.name === 'setup' ? 'An MP4 that plays anywhere.' : undefined}
      dismissable={!running}
      width={phase.name === 'setup' ? 760 : 520}
    >
      {phase.name === 'setup' && (
        <div className="grid grid-cols-[300px_1fr] gap-7">
          <div>
            <div className="flex items-center justify-center rounded-[14px] bg-sunk p-3" style={{ minHeight: 210 }}>
              <LiveFrame project={project} track={track} width={project.aspectRatio === '9:16' ? 140 : project.aspectRatio === '1:1' ? 210 : 274} className="rounded-[6px] shadow-[var(--shadow-soft)]" testId="export-preview" />
            </div>
            <p className="mt-2 text-center text-[11.5px] text-ink-3">The finished composition at the playhead.</p>
            <div className="mt-4 space-y-1.5 text-[12px]">
              <div className="flex justify-between"><span className="text-ink-2">Format</span><span className="text-ink">{isGif ? 'GIF · loops · silent' : `MP4 · H.264${project.media.hasAudio || project.sound.tracks.length > 0 ? ' · AAC' : ''}`}</span></div>
              <div className="flex justify-between"><span className="text-ink-2">Size</span><span className="font-mono text-ink">{size.width} × {size.height}</span></div>
              <div className="flex justify-between"><span className="text-ink-2">Duration</span><span className="font-mono text-ink">{formatTime(duration, true)}</span></div>
            </div>
          </div>
          <div className="space-y-4">
            <Row label="Format">
              <Segmented
                label="Export format"
                value={settings.format}
                onChange={(format) => {
                  setDestination(null)
                  setSettings({ format })
                }}
                options={[{ value: 'mp4', label: 'Video (MP4)' }, { value: 'gif', label: 'Animated GIF' }]}
              />
            </Row>
            <Row label="Aspect ratio">
              <Segmented<AspectRatio>
                label="Aspect ratio"
                value={project.aspectRatio}
                onChange={(aspectRatio) => apply((p) => ({ ...p, aspectRatio }))}
                options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }]}
              />
            </Row>
            {isGif ? (
              <>
                <Row label="Width">
                  <Segmented
                    label="GIF width"
                    value={String(settings.gifWidth)}
                    onChange={(v) => setSettings({ gifWidth: Number(v) as ExportSettings['gifWidth'] })}
                    options={[{ value: '480', label: '480 px' }, { value: '720', label: '720 px' }, { value: '960', label: '960 px' }]}
                  />
                </Row>
                <Row label="Frame rate">
                  <Segmented
                    label="GIF frame rate"
                    value={String(settings.gifFps)}
                    onChange={(v) => setSettings({ gifFps: Number(v) as ExportSettings['gifFps'] })}
                    options={[{ value: '10', label: '10 fps' }, { value: '15', label: '15 fps' }, { value: '20', label: '20 fps' }]}
                  />
                </Row>
                {duration > 30 && <p className="text-[12px] leading-snug text-coral-ink">GIFs get large quickly. For clips over 30 seconds, MP4 is usually the better choice.</p>}
              </>
            ) : (
              <>
            <Row label="Resolution">
              <Segmented
                label="Resolution"
                value={String(settings.resolution)}
                onChange={(v) => setSettings({ resolution: Number(v) as ExportSettings['resolution'] })}
                options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '1440', label: '1440p' }, { value: '2160', label: '4K' }]}
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Frame rate">
                <Segmented label="Frame rate" value={String(settings.fps)} onChange={(v) => setSettings({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30 fps' }, { value: '60', label: '60 fps' }]} />
              </Row>
              <Row label="Quality">
                <Segmented label="Quality" value={settings.quality} onChange={(quality) => setSettings({ quality })} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }]} />
              </Row>
            </div>
              </>
            )}
            <Row label="Save to">
              <div className="flex items-center gap-2 rounded-[12px] bg-sunk py-1.5 pl-3 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={destination ?? undefined} data-testid="export-destination">
                  {destination ? fileName(destination) : 'You’ll choose where to save'}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void choose()}>Choose…</Button>
              </div>
            </Row>
            <Button variant="primary" size="lg" className="w-full" data-testid="export-start" onClick={start} disabled={duration <= 0}>
              {isGif ? 'Export GIF' : 'Export video'}
            </Button>
          </div>
        </div>
      )}

      {phase.name === 'running' && (
        <div className="pt-2" data-testid="export-progress">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[64px] leading-none tabular-nums">{Math.round(phase.progress.fraction * 100)}%</span>
            {phase.progress.totalFrames > 0 && <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">frame {phase.progress.frame} / {phase.progress.totalFrames}</span>}
          </div>
          <p className="mt-2 text-[13px] text-ink-2">{STATUS[phase.progress.phase]}</p>
          <ProgressBar value={phase.progress.fraction} className="mt-5" />
          <div className="mt-6 flex justify-end">
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel export</Button>
          </div>
        </div>
      )}

      {phase.name === 'done' && (
        <div className="pt-1" data-testid="export-done">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-soft text-[#3f6b4c]">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium" title={phase.result.path}>{fileName(phase.result.path)}</p>
              <p className="mt-0.5 text-[12px] text-ink-2">
                {phase.result.width}×{phase.result.height} · {formatTime(phase.result.duration, true)} · rendered in {phase.result.seconds.toFixed(1)} s
              </p>
            </div>
          </div>
          <div className="mt-7 flex gap-2">
            <Button className="flex-1" onClick={() => void window.frameflow.app.revealInFinder(phase.result.path)}>
              <FolderOpen size={14} /> Show in Finder
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}

      {phase.name === 'error' && (
        <div data-testid="export-error">
          <div className="flex gap-3 rounded-[14px] bg-coral-soft p-4 text-[13px] text-[#7a3a2c]">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-coral-ink" />
            <div>
              <p className="font-medium">The export didn’t finish</p>
              <p className="mt-1 text-[12.5px] leading-relaxed">{phase.message}</p>
              <p className="mt-2 text-[11.5px] opacity-80">Your project is unchanged and no partial file was left behind.</p>
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={() => setPhase({ name: 'setup' })}>Back</Button>
        </div>
      )}
    </Sheet>
  )
}

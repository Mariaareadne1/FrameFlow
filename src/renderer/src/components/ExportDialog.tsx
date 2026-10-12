import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FolderOpen, TriangleAlert } from 'lucide-react'
import type { ExportSettings } from '@shared/project'
import { outputSize } from '@shared/engine/layout'
import { keptSegments, outputDuration } from '@shared/engine/timeline'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { playback } from '../state/playhead'
import { ExportCancelledError, exportProject, type ExportProgress, type ExportResult } from '../media/exporter'
import { errorMessage, formatTime } from '../lib/format'
import { Modal } from './Modal'
import { Button, Segmented } from './ui'

type Phase = { name: 'setup' } | { name: 'running'; progress: ExportProgress } | { name: 'done'; result: ExportResult } | { name: 'error'; message: string }

export function ExportDialog() {
  const open = useApp((s) => s.exportOpen)
  const setOpen = useApp((s) => s.setExportOpen)
  const project = useEditor((s) => s.project)
  const apply = useEditor((s) => s.apply)
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) setPhase({ name: 'setup' })
  }, [open])

  if (!project) return null
  const settings = project.export
  const size = outputSize(project.aspectRatio, settings.resolution)
  const duration = outputDuration(keptSegments(project.trims, project.media.duration))
  const setSettings = (patch: Partial<ExportSettings>) => apply((p) => ({ ...p, export: { ...p.export, ...patch } }))
  const running = phase.name === 'running'

  const start = async () => {
    playback.pause()
    const dest = await window.frameflow.export.chooseDestination(project.name)
    if (!dest) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase({ name: 'running', progress: { phase: 'preparing', fraction: 0, frame: 0, totalFrames: 0 } })
    try {
      const { project: current, track } = useEditor.getState()
      if (!current) throw new Error('No project is open.')
      const result = await exportProject({
        project: current,
        track,
        destination: dest,
        signal: controller.signal,
        onProgress: (progress) => setPhase({ name: 'running', progress }),
      })
      setPhase({ name: 'done', result })
    } catch (err) {
      if (err instanceof ExportCancelledError) setPhase({ name: 'setup' })
      else setPhase({ name: 'error', message: errorMessage(err) })
    } finally {
      abortRef.current = null
    }
  }

  return (
    <Modal open={open} onClose={() => !running && setOpen(false)} title="Export Video" dismissable={!running}>
      {phase.name === 'setup' && (
        <div className="space-y-4 pt-2">
          <div>
            <div className="mb-1.5 text-xs text-muted">Resolution</div>
            <Segmented
              label="Resolution"
              value={String(settings.resolution)}
              onChange={(v) => setSettings({ resolution: Number(v) as ExportSettings['resolution'] })}
              options={[
                { value: '720', label: '720p' },
                { value: '1080', label: '1080p' },
                { value: '1440', label: '1440p' },
                { value: '2160', label: '4K' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs text-muted">Frame rate</div>
              <Segmented label="Frame rate" value={String(settings.fps)} onChange={(v) => setSettings({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30 fps' }, { value: '60', label: '60 fps' }]} />
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted">Quality</div>
              <Segmented label="Quality" value={settings.quality} onChange={(quality) => setSettings({ quality })} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }]} />
            </div>
          </div>
          <div className="rounded-xl bg-black/25 px-4 py-3 text-[12px] text-muted ring-1 ring-line">
            <div className="flex justify-between"><span>Output</span><span className="font-mono text-fg">{size.width} × {size.height} · H.264 MP4</span></div>
            <div className="mt-1 flex justify-between"><span>Duration</span><span className="font-mono text-fg">{formatTime(duration, true)}</span></div>
            {project.media.hasAudio && <div className="mt-1 flex justify-between"><span>Audio</span><span className="text-fg">AAC</span></div>}
          </div>
          <Button variant="primary" size="lg" className="w-full" data-testid="export-start" onClick={start} disabled={duration <= 0}>
            Export…
          </Button>
        </div>
      )}
      {phase.name === 'running' && (
        <div className="space-y-4 pt-3" data-testid="export-progress">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-fg">{phase.progress.phase === 'finalizing' ? 'Finishing file…' : phase.progress.phase === 'preparing' ? 'Preparing…' : 'Rendering frames…'}</span>
            <span className="font-mono text-muted tabular-nums">{Math.round(phase.progress.fraction * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${phase.progress.fraction * 100}%` }} />
          </div>
          {phase.progress.totalFrames > 0 && (
            <div className="text-[11px] text-subtle tabular-nums">Frame {phase.progress.frame} of {phase.progress.totalFrames}</div>
          )}
          <Button variant="secondary" className="w-full" onClick={() => abortRef.current?.abort()}>Cancel</Button>
        </div>
      )}
      {phase.name === 'done' && (
        <div className="space-y-4 pt-3 text-center" data-testid="export-done">
          <CheckCircle2 className="mx-auto text-success" size={36} />
          <div>
            <p className="text-[14px] font-medium">Your video is ready</p>
            <p className="mt-1 break-all text-[12px] text-muted">{phase.result.path}</p>
            <p className="mt-1 text-[11px] text-subtle">{phase.result.width}×{phase.result.height} · {formatTime(phase.result.duration, true)} · exported in {phase.result.seconds.toFixed(1)}s</p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void window.frameflow.app.revealInFinder(phase.result.path)}><FolderOpen size={14} /> Show in Finder</Button>
            <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}
      {phase.name === 'error' && (
        <div className="space-y-4 pt-3" data-testid="export-error">
          <div className="flex gap-3 rounded-xl bg-danger/10 p-4 text-[13px] text-[#ffd0d0] ring-1 ring-danger/25">
            <TriangleAlert size={18} className="shrink-0 text-danger" />
            <div>
              <p className="font-medium">Export failed</p>
              <p className="mt-1 text-[12px] leading-relaxed opacity-90">{phase.message}</p>
              <p className="mt-2 text-[11px] opacity-70">Your project was not changed. No partial file was left behind.</p>
            </div>
          </div>
          <Button className="w-full" onClick={() => setPhase({ name: 'setup' })}>Back</Button>
        </div>
      )}
    </Modal>
  )
}

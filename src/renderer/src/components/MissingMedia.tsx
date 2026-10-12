import { useState } from 'react'
import { FileWarning } from 'lucide-react'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { probeMedia } from '../media/source'
import { errorMessage } from '../lib/format'
import { Button } from './ui'

/** Shown when a project's source video was moved or deleted. */
export function MissingMedia() {
  const project = useEditor((s) => s.project)
  const toast = useApp((s) => s.toast)
  const navigate = useApp((s) => s.navigate)
  const [busy, setBusy] = useState(false)
  if (!project) return null

  const locate = async () => {
    setBusy(true)
    try {
      const file = await window.frameflow.media.chooseVideo()
      if (!file) return
      const probe = await probeMedia(file)
      if (Math.abs(probe.duration - project.media.duration) > 1) {
        toast('error', `That video is ${probe.duration.toFixed(1)}s long, but this project expects ${project.media.duration.toFixed(1)}s. Choose the original recording.`)
        return
      }
      useEditor.getState().patchAll((p) => ({ ...p, media: { ...p.media, path: file, width: probe.width, height: probe.height } }))
      useEditor.setState({ mediaMissing: false })
      toast('success', 'Video relinked.')
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8" data-testid="missing-media">
      <div className="ff-rise max-w-[520px] rounded-[var(--radius-sheet)] bg-surface p-10 shadow-[var(--shadow-soft)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-soft text-coral-ink">
          <FileWarning size={20} />
        </span>
        <h2 className="font-display mt-5 text-[34px] leading-tight">Where did the video go?</h2>
        <p className="mt-3 break-all text-[13px] leading-relaxed text-ink-2">
          This project uses <span className="font-mono text-[12px] text-ink">{project.media.path}</span>. It was moved, deleted, or needs your confirmation. Your edits are safe.
        </p>
        <div className="mt-7 flex gap-2">
          <Button variant="primary" disabled={busy} onClick={locate}>Locate video…</Button>
          <Button onClick={() => navigate({ name: 'home' })}>Back to projects</Button>
        </div>
      </div>
    </div>
  )
}

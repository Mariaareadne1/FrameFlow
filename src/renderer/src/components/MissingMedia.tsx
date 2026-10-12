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
      <div className="max-w-md rounded-2xl bg-panel p-8 text-center ring-1 ring-line">
        <FileWarning className="mx-auto text-trim" size={30} />
        <h2 className="mt-4 text-lg font-semibold">Can't find the video</h2>
        <p className="mt-2 break-all text-[13px] leading-relaxed text-muted">This project uses <span className="font-mono text-[12px] text-fg">{project.media.path}</span>, which was moved or deleted. Your edits are safe.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" disabled={busy} onClick={locate}>Locate Video…</Button>
          <Button onClick={() => navigate({ name: 'home' })}>Back Home</Button>
        </div>
      </div>
    </div>
  )
}

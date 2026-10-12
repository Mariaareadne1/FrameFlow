import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { useApp } from '../state/appStore'
import { Modal } from './Modal'
import { Button, Segmented, Toggle } from './ui'

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen)
  const setOpen = useApp((s) => s.setSettingsOpen)
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    if (open) window.frameflow.app.info().then(setInfo, () => setInfo(null))
  }, [open])

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Settings">
      <div className="space-y-5 pt-2">
        <div>
          <div className="mb-1.5 text-xs text-muted">Default style for new demos</div>
          <Segmented label="Default style" value={prefs.style} onChange={(style) => setPrefs({ style })} options={[{ value: 'clean', label: 'Clean' }, { value: 'minimal', label: 'Minimal' }, { value: 'colorful', label: 'Colorful' }]} />
        </div>
        <div>
          <div className="mb-1.5 text-xs text-muted">Default automatic zoom</div>
          <Segmented label="Default automatic zoom" value={prefs.autoZoom} onChange={(autoZoom) => setPrefs({ autoZoom })} options={[{ value: 'off', label: 'Off' }, { value: 'subtle', label: 'Subtle' }, { value: 'dynamic', label: 'Dynamic' }]} />
        </div>
        <div>
          <div className="mb-1.5 text-xs text-muted">Countdown before recording</div>
          <Segmented label="Countdown" value={String(prefs.countdown)} onChange={(v) => setPrefs({ countdown: Number(v) })} options={[{ value: '0', label: 'None' }, { value: '3', label: '3 seconds' }, { value: '5', label: '5 seconds' }]} />
        </div>
        <Toggle label="Record microphone by default" checked={prefs.microphone} onChange={(microphone) => setPrefs({ microphone })} />
        <div className="rounded-xl bg-black/25 p-4 text-[12px] leading-relaxed text-muted ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-fg">Library</span>
            {info && (
              <Button size="sm" variant="ghost" onClick={() => void window.frameflow.app.revealInFinder(info.libraryPath)}>
                <FolderOpen size={13} /> Reveal
              </Button>
            )}
          </div>
          <p className="break-all font-mono text-[11px]">{info?.libraryPath ?? '…'}</p>
          <p className="mt-3">Recordings, cursor data and projects stay on this Mac. FrameFlow has no accounts, no analytics and never uploads anything.</p>
        </div>
        <p className="text-center text-[11px] text-subtle">FrameFlow {info?.version ?? ''}</p>
      </div>
    </Modal>
  )
}

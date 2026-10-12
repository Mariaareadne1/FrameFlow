import { useEffect, useState, type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { STYLE_PRESETS } from '@shared/styles'
import { useApp } from '../state/appStore'
import { Sheet } from './Modal'
import { Button, Segmented, Toggle } from './ui'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line-soft py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] text-ink">{label}</div>
      {children}
    </div>
  )
}

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
    <Sheet open={open} onClose={() => setOpen(false)} title="Settings" subtitle="Defaults for new projects. Every project can still be changed." width={540}>
      <Group title="New projects">
        <Field label="Style">
          <Segmented label="Default style" size="sm" value={prefs.style} onChange={(style) => setPrefs({ style })} options={STYLE_PRESETS.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="Camera feel">
          <Segmented label="Default camera feel" size="sm" value={prefs.camera} onChange={(camera) => setPrefs({ camera })} options={[{ value: 'still', label: 'Still' }, { value: 'calm', label: 'Calm' }, { value: 'follow', label: 'Follow' }, { value: 'focus', label: 'Focus' }]} />
        </Field>
        <Field label="Cursor">
          <Segmented label="Default cursor" size="sm" value={prefs.cursor} onChange={(cursor) => setPrefs({ cursor })} options={[{ value: 'natural', label: 'Natural' }, { value: 'halo', label: 'Halo' }, { value: 'spotlight', label: 'Spotlight' }, { value: 'pulse', label: 'Pulse' }]} />
        </Field>
      </Group>
      <Group title="Recording">
        <Field label="Countdown">
          <Segmented label="Countdown" size="sm" value={String(prefs.countdown)} onChange={(v) => setPrefs({ countdown: Number(v) })} options={[{ value: '0', label: 'None' }, { value: '3', label: '3 seconds' }, { value: '5', label: '5 seconds' }]} />
        </Field>
        <Toggle label="Record microphone by default" checked={prefs.microphone} onChange={(microphone) => setPrefs({ microphone })} />
      </Group>
      <Group title="Library & privacy">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-mono text-[11.5px] text-ink-2" title={info?.libraryPath}>{info?.libraryPath ?? '…'}</p>
          {info && (
            <Button size="sm" onClick={() => void window.frameflow.app.revealInFinder(info.libraryPath)}>
              <FolderOpen size={13} /> Reveal
            </Button>
          )}
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-2">Recordings, cursor data and projects stay on this Mac. FrameFlow has no accounts, no analytics and never uploads anything.</p>
      </Group>
      <p className="pt-2 text-center text-[11.5px] text-ink-3">
        <span className="font-display text-[15px] text-ink">FrameFlow</span> {info?.version ?? ''}
      </p>
    </Sheet>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AppWindow, ChevronLeft, Mic, Monitor, RefreshCw, ShieldAlert, Square } from 'lucide-react'
import { clsx } from 'clsx'
import type { CaptureEvent, CaptureSource, PermissionState } from '@shared/ipc'
import { useApp } from '../state/appStore'
import { errorMessage, formatTime } from '../lib/format'
import { Button, Segmented, Spinner, Toggle } from '../components/ui'

type Phase = { name: 'idle' } | { name: 'countdown'; remaining: number } | { name: 'recording'; seconds: number } | { name: 'stopping' }

export function RecordSetup({ intent }: { intent: 'quick' | 'advanced' }) {
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const [permission, setPermission] = useState<PermissionState | null>(null)
  const [sources, setSources] = useState<CaptureSource[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<'display' | 'window'>('display')
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [starting, setStarting] = useState(false)

  const refresh = useCallback(async () => {
    const p = await window.frameflow.capture.permission()
    setPermission(p)
    if (p !== 'granted' && p !== 'not-determined') return
    try {
      const list = await window.frameflow.capture.listSources()
      setSources(list)
      setSelected((cur) => cur ?? (list.find((s) => s.type === 'display') ? `display:${list.find((s) => s.type === 'display')!.id}` : null))
    } catch (err) {
      setSources([])
      toast('error', `Could not list screens: ${errorMessage(err)}`)
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.frameflow.capture.onEvent((e: CaptureEvent) => {
      if (e.type === 'countdown') setPhase({ name: 'countdown', remaining: e.remaining })
      else if (e.type === 'started') setPhase({ name: 'recording', seconds: 0 })
      else if (e.type === 'progress') setPhase({ name: 'recording', seconds: e.seconds })
      else if (e.type === 'stopping') setPhase({ name: 'stopping' })
      else if (e.type === 'error') setPhase({ name: 'idle' })
    })
  }, [])

  const start = async () => {
    if (!selected) return
    const [type, id] = selected.split(':') as ['display' | 'window', string]
    setStarting(true)
    try {
      await window.frameflow.capture.start({ source: { type, id: Number(id) }, microphone: prefs.microphone, countdown: prefs.countdown })
    } catch (err) {
      toast('error', errorMessage(err))
      setPhase({ name: 'idle' })
    } finally {
      setStarting(false)
    }
  }

  const visible = (sources ?? []).filter((s) => s.type === tab)
  const needsPermission = permission === 'denied' || permission === 'restricted'
  const active = phase.name !== 'idle'

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-14 shrink-0 items-center gap-3 border-b border-line pl-24 pr-4">
        <Button variant="ghost" className="no-drag" disabled={active} onClick={() => navigate({ name: 'home' })}>
          <ChevronLeft size={15} /> Home
        </Button>
        <div className="text-[13px] font-medium">{intent === 'quick' ? 'New Quick Demo' : 'New Recording'}</div>
      </header>

      {active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6" data-testid="recording-status">
          {phase.name === 'countdown' && (
            <>
              <div className="text-[96px] font-semibold tabular-nums leading-none text-white">{phase.remaining}</div>
              <p className="text-muted">Recording starts in a moment…</p>
            </>
          )}
          {phase.name === 'recording' && (
            <>
              <div className="flex items-center gap-3 text-2xl font-semibold tabular-nums">
                <span className="ff-pulse h-3 w-3 rounded-full bg-rec" /> {formatTime(phase.seconds)}
              </div>
              <p className="text-muted">Recording. FrameFlow's own windows are hidden from the capture.</p>
            </>
          )}
          {phase.name === 'stopping' && (
            <div className="flex items-center gap-3 text-muted"><Spinner /> Finishing recording…</div>
          )}
          {phase.name !== 'stopping' && (
            <div className="flex gap-2">
              <Button variant="primary" size="lg" data-testid="stop-recording" onClick={() => void window.frameflow.capture.stop()}>
                <Square size={14} fill="currentColor" /> {phase.name === 'countdown' ? 'Cancel' : 'Stop Recording'}
              </Button>
              {phase.name === 'recording' && (
                <Button variant="ghost" size="lg" onClick={() => void window.frameflow.capture.cancel()}>Discard</Button>
              )}
            </div>
          )}
          <p className="text-[12px] text-subtle">Stop any time with ⌘⇧2 or the floating control.</p>
        </div>
      ) : needsPermission ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md rounded-2xl bg-panel p-8 ring-1 ring-line" data-testid="permission-guidance">
            <ShieldAlert className="text-accent" size={28} />
            <h2 className="mt-4 text-lg font-semibold">Allow screen recording</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              macOS needs your permission before FrameFlow can record. Open <b className="text-fg">System Settings › Privacy &amp; Security › Screen &amp; System Audio Recording</b>, turn on FrameFlow, then come back here.
            </p>
            <p className="mt-2 text-[12px] text-subtle">macOS may ask you to reopen FrameFlow after granting access.</p>
            <div className="mt-6 flex gap-2">
              <Button variant="primary" onClick={() => void window.frameflow.capture.openPermissionSettings()}>Open System Settings</Button>
              <Button onClick={() => void refresh()}><RefreshCw size={14} /> Check Again</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
              <Segmented
                label="Source type"
                value={tab}
                onChange={setTab}
                className="w-64"
                options={[
                  { value: 'display', label: <><Monitor size={13} /> Screens</> },
                  { value: 'window', label: <><AppWindow size={13} /> Windows</> },
                ]}
              />
              <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw size={13} /> Refresh</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {sources === null ? (
                <div className="flex h-40 items-center justify-center"><Spinner /></div>
              ) : visible.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-muted">{tab === 'window' ? 'No windows available to record.' : 'No displays found.'}</div>
              ) : (
                <div className="grid grid-cols-3 gap-3" role="listbox" aria-label="Capture sources">
                  {visible.map((s) => {
                    const key = `${s.type}:${s.id}`
                    return (
                      <button
                        key={key}
                        role="option"
                        aria-selected={selected === key}
                        data-testid={`source-${key}`}
                        onClick={() => setSelected(key)}
                        className={clsx(
                          'overflow-hidden rounded-xl bg-panel text-left ring-1 transition',
                          selected === key ? 'ring-2 ring-accent' : 'ring-line hover:ring-line-strong',
                        )}
                      >
                        <div className="flex aspect-[16/10] items-center justify-center bg-black/40">
                          {s.thumbnail ? <img src={s.thumbnail} alt="" className="h-full w-full object-contain" /> : s.type === 'display' ? <Monitor className="text-subtle" /> : <AppWindow className="text-subtle" />}
                        </div>
                        <div className="truncate px-3 py-2 text-[12px]">{s.name}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-panel/60 p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Options</h3>
            <div className="mt-4 space-y-4">
              <Toggle label="Microphone" description="Record your voice with the screen" checked={prefs.microphone} onChange={(microphone) => setPrefs({ microphone })} />
              <div>
                <div className="mb-1.5 text-xs text-muted">Countdown</div>
                <Segmented
                  label="Countdown"
                  value={String(prefs.countdown)}
                  onChange={(v) => setPrefs({ countdown: Number(v) })}
                  options={[{ value: '0', label: 'None' }, { value: '3', label: '3s' }, { value: '5', label: '5s' }]}
                />
              </div>
              {permission === 'not-determined' && (
                <p className="rounded-lg bg-accent-soft p-3 text-[12px] leading-relaxed text-[#c9ccff]">
                  <Mic size={12} className="mr-1 inline" /> macOS will ask for Screen Recording permission when you start.
                </p>
              )}
            </div>
            <div className="mt-auto">
              <p className="mb-3 text-[12px] leading-relaxed text-subtle">
                Your cursor is recorded separately so FrameFlow can smooth it and zoom to your clicks.
              </p>
              <Button variant="primary" size="lg" className="w-full" data-testid="start-recording" disabled={!selected || starting} onClick={start}>
                {starting ? <Spinner size={14} /> : <span className="h-2.5 w-2.5 rounded-full bg-white" />} Start Recording
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

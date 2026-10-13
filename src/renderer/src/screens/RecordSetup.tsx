import { useCallback, useEffect, useState } from 'react'
import { AppWindow, ArrowLeft, Check, Mic, Monitor, RefreshCw, ShieldCheck, Square, Volume2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { CaptureEvent, CaptureSource, PermissionState } from '@shared/ipc'
import { useApp } from '../state/appStore'
import { errorMessage, formatTime } from '../lib/format'
import { Button, Segmented, Spinner } from '../components/ui'
import { ConfirmDialog } from '../components/Modal'

type Phase = { name: 'idle' } | { name: 'countdown'; remaining: number } | { name: 'recording'; seconds: number } | { name: 'stopping' }

export function RecordSetup() {
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
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const refresh = useCallback(async () => {
    const p = await window.frameflow.capture.permission()
    setPermission(p)
    if (p !== 'granted' && p !== 'not-determined') return
    try {
      const list = await window.frameflow.capture.listSources()
      setSources(list)
      const firstDisplay = list.find((s) => s.type === 'display')
      setSelected((cur) => cur ?? (firstDisplay ? `display:${firstDisplay.id}` : null))
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
      else if (e.type === 'error' || e.type === 'cancelled') setPhase({ name: 'idle' })
    })
  }, [])

  const start = async () => {
    if (!selected) return
    const [type, id] = selected.split(':') as ['display' | 'window', string]
    setStarting(true)
    try {
      await window.frameflow.capture.start({ source: { type, id: Number(id) }, microphone: prefs.microphone, systemAudio: prefs.systemAudio, countdown: prefs.countdown })
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
  const selectedSource = sources?.find((s) => `${s.type}:${s.id}` === selected)

  return (
    <div className="flex h-full flex-col bg-paper" data-testid="record-setup">
      <header className="drag-region flex h-14 shrink-0 items-center gap-3 pl-24 pr-5">
        <Button variant="ghost" className="no-drag" disabled={active} onClick={() => navigate({ name: 'home' })}>
          <ArrowLeft size={15} /> Projects
        </Button>
      </header>

      {active ? (
        <div className="ff-fade flex flex-1 flex-col items-center justify-center gap-7" data-testid="recording-status">
          {phase.name === 'countdown' && (
            <>
              <div className="font-display text-[160px] leading-none text-ink tabular-nums">{phase.remaining}</div>
              <p className="text-[15px] text-ink-2">Get ready — recording starts in a moment.</p>
            </>
          )}
          {phase.name === 'recording' && (
            <>
              <div className="flex items-center gap-4">
                <span className="ff-pulse h-3.5 w-3.5 rounded-full bg-coral" />
                <span className="font-display text-[72px] leading-none tabular-nums">{formatTime(phase.seconds)}</span>
              </div>
              <p className="text-[14px] text-ink-2">Recording. FrameFlow's own windows stay out of the picture.</p>
            </>
          )}
          {phase.name === 'stopping' && (
            <div className="flex items-center gap-3 text-[14px] text-ink-2">
              <Spinner /> Finishing your recording…
            </div>
          )}
          {phase.name !== 'stopping' && (
            <div className="flex gap-2">
              <Button variant="primary" size="lg" data-testid="stop-recording" onClick={() => void window.frameflow.capture.stop()}>
                <Square size={13} fill="currentColor" /> {phase.name === 'countdown' ? 'Cancel' : 'Stop recording'}
              </Button>
              {phase.name === 'recording' && (
                <Button variant="ghost" size="lg" onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
              )}
            </div>
          )}
          <p className="text-[12px] text-ink-3">Stop any time with ⌘⇧2 or the floating control.</p>
          <ConfirmDialog
            open={confirmDiscard && phase.name === 'recording'}
            title="Discard this take?"
            body="The recording so far will be deleted. This can't be undone."
            confirmLabel="Discard recording"
            danger
            onCancel={() => setConfirmDiscard(false)}
            onConfirm={() => {
              setConfirmDiscard(false)
              void window.frameflow.capture.cancel()
            }}
          />
        </div>
      ) : needsPermission ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="ff-rise max-w-[520px] rounded-[var(--radius-sheet)] bg-surface p-10 shadow-[var(--shadow-soft)]" data-testid="permission-guidance">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lavender-soft text-lavender-ink">
              <ShieldCheck size={20} />
            </span>
            <h2 className="font-display mt-5 text-[34px] leading-tight">Allow screen recording</h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
              macOS asks for your permission before any app can see the screen. Open{' '}
              <span className="text-ink">System Settings › Privacy &amp; Security › Screen &amp; System Audio Recording</span>, switch on FrameFlow, then come back.
            </p>
            <p className="mt-2 text-[12.5px] text-ink-3">macOS may ask you to reopen FrameFlow afterwards. Nothing you record ever leaves this Mac.</p>
            <div className="mt-7 flex gap-2">
              <Button variant="primary" onClick={() => void window.frameflow.capture.openPermissionSettings()}>Open System Settings</Button>
              <Button onClick={() => void refresh()}>
                <RefreshCw size={14} /> Check again
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-8 px-12 pb-10">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-end justify-between pb-6">
              <div>
                <h1 className="font-display text-[44px] leading-none">What should we record?</h1>
                <p className="mt-2 text-[14px] text-ink-2">Choose a whole screen or a single window.</p>
              </div>
              <div className="flex items-center gap-2">
                <Segmented
                  label="Source type"
                  value={tab}
                  onChange={setTab}
                  className="w-[230px]"
                  options={[
                    { value: 'display', label: <><Monitor size={13} /> Screens</> },
                    { value: 'window', label: <><AppWindow size={13} /> Windows</> },
                  ]}
                />
                <Button variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Refresh sources">
                  <RefreshCw size={13} />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {sources === null ? (
                <div className="flex h-40 items-center justify-center"><Spinner /></div>
              ) : visible.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-ink-2">{tab === 'window' ? 'No windows are available to record.' : 'No displays found.'}</div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 p-1" role="listbox" aria-label="Capture sources">
                  {visible.map((s) => {
                    const key = `${s.type}:${s.id}`
                    const isSel = selected === key
                    return (
                      <button
                        key={key}
                        role="option"
                        aria-selected={isSel}
                        data-testid={`source-${key}`}
                        onClick={() => setSelected(key)}
                        className={clsx(
                          'group relative overflow-hidden rounded-[var(--radius-card)] bg-surface text-left shadow-[var(--shadow-soft)] transition',
                          isSel ? 'ring-2 ring-ink' : 'ring-1 ring-transparent hover:ring-line',
                        )}
                      >
                        <div className="flex aspect-[16/10] items-center justify-center bg-sunk">
                          {s.thumbnail ? <img src={s.thumbnail} alt="" className="h-full w-full object-contain" /> : s.type === 'display' ? <Monitor className="text-ink-3" size={28} /> : <AppWindow className="text-ink-3" size={28} />}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                          <span className="truncate text-[13px] font-medium">{s.name}</span>
                          <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition', isSel ? 'bg-ink text-paper' : 'bg-sunk text-transparent')}>
                            <Check size={12} strokeWidth={3} />
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="flex w-[300px] shrink-0 flex-col rounded-[var(--radius-sheet)] bg-surface p-6 shadow-[var(--shadow-soft)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Recording</div>
            <div className="font-display mt-2 truncate text-[24px] leading-tight">{selectedSource?.name ?? 'Choose a source'}</div>
            <div className="mt-6 space-y-5">
              <div>
                <div className="mb-2 text-[12.5px] text-ink">Sound</div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sound">
                  {(
                    [
                      { key: 'systemAudio', label: 'System audio', hint: 'What your Mac plays', icon: <Volume2 size={15} /> },
                      { key: 'microphone', label: 'Microphone', hint: 'Your voice', icon: <Mic size={15} /> },
                    ] as const
                  ).map((o) => {
                    const on = prefs[o.key]
                    return (
                      <button
                        key={o.key}
                        role="switch"
                        aria-checked={on}
                        aria-label={o.label}
                        data-testid={`sound-${o.key}`}
                        onClick={() => setPrefs({ [o.key]: !on })}
                        className={clsx('rounded-[12px] p-3 text-left transition', on ? 'bg-ink text-paper' : 'bg-sunk text-ink hover:bg-sunk-2')}
                      >
                        {o.icon}
                        <div className="mt-2 text-[12.5px] font-medium">{o.label}</div>
                        <div className={clsx('text-[11px]', on ? 'text-paper/70' : 'text-ink-2')}>{on ? 'On' : o.hint}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[12.5px] text-ink">Countdown</div>
                <Segmented
                  label="Countdown"
                  value={String(prefs.countdown)}
                  onChange={(v) => setPrefs({ countdown: Number(v) })}
                  options={[{ value: '0', label: 'None' }, { value: '3', label: '3 s' }, { value: '5', label: '5 s' }]}
                />
              </div>
              {permission === 'not-determined' && <p className="text-[12px] leading-relaxed text-ink-2">macOS will ask for Screen Recording permission when you start.</p>}
            </div>
            <div className="mt-auto flex flex-col items-center pt-8">
              <button
                data-testid="start-recording"
                disabled={!selected || starting}
                onClick={start}
                aria-label="Start recording"
                className="group flex h-20 w-20 items-center justify-center rounded-full bg-surface shadow-[0_0_0_1px_var(--color-line),0_10px_30px_-10px_rgba(180,96,76,0.5)] transition hover:scale-[1.03] active:scale-95 disabled:opacity-40"
              >
                {starting ? <Spinner size={22} /> : <span className="h-11 w-11 rounded-full bg-coral transition-all group-hover:h-12 group-hover:w-12" />}
              </button>
              <span className="mt-3 text-[13px] font-medium">Start recording</span>
              <span className="mt-1 text-center text-[11.5px] leading-snug text-ink-3">Your cursor is captured separately so it can glide and the camera can follow your clicks.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

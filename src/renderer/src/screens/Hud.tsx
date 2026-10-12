import { useEffect, useState } from 'react'
import { Square, X } from 'lucide-react'
import type { CaptureEvent } from '@shared/ipc'
import { formatTime } from '../lib/format'

/** The small floating control shown while recording. It is excluded from captures. */
export function Hud() {
  const [state, setState] = useState<{ kind: 'countdown'; n: number } | { kind: 'recording'; s: number } | { kind: 'stopping' } | { kind: 'idle' }>({ kind: 'idle' })
  useEffect(() => {
    // Tick locally between the helper's once-per-second progress events.
    let startedAt: number | null = null
    const timer = setInterval(() => {
      if (startedAt !== null) setState({ kind: 'recording', s: (performance.now() - startedAt) / 1000 })
    }, 250)
    const off = window.frameflow.capture.onEvent((e: CaptureEvent) => {
      if (e.type === 'countdown') setState({ kind: 'countdown', n: e.remaining })
      else if (e.type === 'started') {
        startedAt = performance.now()
        setState({ kind: 'recording', s: 0 })
      } else if (e.type === 'progress') {
        startedAt = performance.now() - e.seconds * 1000
        setState({ kind: 'recording', s: e.seconds })
      } else if (e.type === 'stopping') {
        startedAt = null
        setState({ kind: 'stopping' })
      }
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [])

  return (
    <div className="drag-region flex h-full w-full items-center justify-center p-2">
      <div className="flex h-12 w-full items-center gap-3 rounded-full bg-[#fbfaf7]/95 pl-4 pr-1.5 text-ink shadow-[0_8px_30px_-8px_rgba(37,38,43,0.35)] ring-1 ring-[#dfded8] backdrop-blur-xl">
        {state.kind === 'countdown' ? (
          <span className="font-display flex-1 text-center text-[19px]">Recording in {state.n}…</span>
        ) : state.kind === 'stopping' ? (
          <span className="flex-1 text-center text-[13px] text-ink-2">Saving…</span>
        ) : (
          <>
            <span className="ff-pulse h-2.5 w-2.5 rounded-full bg-coral" />
            <span className="font-display flex-1 text-[21px] tabular-nums leading-none">{formatTime(state.kind === 'recording' ? state.s : 0)}</span>
          </>
        )}
        {state.kind === 'recording' && (
          <button aria-label="Discard recording" title="Discard recording" className="no-drag flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-sunk hover:text-ink" onClick={() => void window.frameflow.capture.cancel()}>
            <X size={15} />
          </button>
        )}
        <button
          className="no-drag flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-medium text-paper hover:bg-[#34353b]"
          onClick={() => void window.frameflow.capture.stop()}
        >
          <Square size={10} fill="currentColor" /> {state.kind === 'countdown' ? 'Cancel' : 'Stop'}
        </button>
      </div>
    </div>
  )
}

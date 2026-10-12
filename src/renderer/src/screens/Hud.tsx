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
      <div className="flex h-12 w-full items-center gap-3 rounded-2xl bg-[#16171c]/95 px-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        {state.kind === 'countdown' ? (
          <span className="flex-1 text-center text-[13px] font-medium">Recording in {state.n}…</span>
        ) : state.kind === 'stopping' ? (
          <span className="flex-1 text-center text-[13px] text-white/70">Saving…</span>
        ) : (
          <>
            <span className="ff-pulse ml-1 h-2.5 w-2.5 rounded-full bg-rec" />
            <span className="flex-1 font-mono text-[13px] tabular-nums">{formatTime(state.kind === 'recording' ? state.s : 0)}</span>
          </>
        )}
        <button
          className="no-drag flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[12px] font-medium hover:bg-white/20"
          onClick={() => void window.frameflow.capture.stop()}
        >
          <Square size={11} fill="currentColor" /> {state.kind === 'countdown' ? 'Cancel' : 'Stop'}
        </button>
        {state.kind === 'recording' && (
          <button aria-label="Discard recording" title="Discard recording" className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" onClick={() => void window.frameflow.capture.cancel()}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

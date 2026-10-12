import { useEffect, useMemo, useRef, useState } from 'react'
import type { CursorTrack, Project } from '@shared/project'
import { outputSize } from '@shared/engine/layout'
import { buildScene, renderFrame } from '../engine/render'
import { playback, usePlayhead } from '../state/playhead'

/** The playhead time, but updated at most every `ms` (for small secondary previews). */
function useThrottledTime(ms: number): number {
  const [t, setT] = useState(() => usePlayhead.getState().time)
  useEffect(() => {
    let last = 0
    let timer: number | null = null
    const unsubscribe = usePlayhead.subscribe((s) => {
      const now = performance.now()
      if (now - last >= ms) {
        last = now
        setT(s.time)
      } else if (timer === null) {
        timer = window.setTimeout(() => {
          timer = null
          last = performance.now()
          setT(usePlayhead.getState().time)
        }, ms)
      }
    })
    return () => {
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [ms])
  return t
}

/**
 * A small live render of `project` at the current playhead, drawn by the same renderer as
 * the preview and the exporter. Used for style cards and the export sheet.
 */
export function LiveFrame({ project, track, width, className, testId }: { project: Project; track: CursorTrack | null; width: number; className?: string; testId?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const t = useThrottledTime(160)
  // Seeks finish asynchronously; repaint when the new frame is actually decoded.
  const [frameTick, setFrameTick] = useState(0)
  useEffect(() => {
    const video = playback.video()
    if (!video) return
    const bump = () => setFrameTick((n) => n + 1)
    video.addEventListener('seeked', bump)
    video.addEventListener('loadeddata', bump)
    return () => {
      video.removeEventListener('seeked', bump)
      video.removeEventListener('loadeddata', bump)
    }
  }, [])
  const scene = useMemo(() => buildScene(project, track), [project, track])
  const out = outputSize(project.aspectRatio, 1080)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.round(width * dpr)
  const h = Math.round((width * out.height * dpr) / out.width)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    const video = playback.video()
    const ready = !!video && video.readyState >= 2 && video.videoWidth > 0
    const s = ready ? { ...scene, srcW: video.videoWidth, srcH: video.videoHeight } : scene
    renderFrame(ctx, { width: w, height: h }, s, ready ? video : null, t)
  }, [scene, t, w, h, frameTick])

  return <canvas ref={ref} width={w} height={h} data-testid={testId} className={className} style={{ width, height: (width * out.height) / out.width }} />
}

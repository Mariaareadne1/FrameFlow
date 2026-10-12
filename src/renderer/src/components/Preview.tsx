import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { CursorTrack, Project } from '@shared/project'
import { outputSize } from '@shared/engine/layout'
import { keptSegments, playableTime } from '@shared/engine/timeline'
import { buildScene, renderFrame, type RenderScene } from '../engine/render'
import { playback, usePlayhead } from '../state/playhead'
import { setThumbnailProvider } from '../lib/autosave'

/** Preview never renders above this many pixels on its long side; exports render at full size. */
const MAX_PREVIEW_LONG_SIDE = 1920

interface Props {
  project: Project
  track: CursorTrack | null
  className?: string
}

export function Preview({ project, track, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const playing = usePlayhead((s) => s.playing)

  // Scene depends only on what affects pixels, so unrelated edits don't rebuild paths.
  const scene = useMemo<RenderScene>(
    () => buildScene(project, track),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.media, project.frame, project.background, project.zooms, project.cursor, track],
  )
  const segments = useMemo(() => keptSegments(project.trims, project.media.duration), [project.trims, project.media.duration])
  const out = outputSize(project.aspectRatio, 1080)
  const aspect = out.width / out.height

  const sceneRef = useRef(scene)
  const segmentsRef = useRef(segments)
  sceneRef.current = scene
  segmentsRef.current = segments

  // ---- Fit the stage into the available space ----
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      const w = Math.min(width, height * aspect)
      setBox({ width: Math.floor(w), height: Math.floor(w / aspect) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const pixelSize = useMemo(() => {
    const dpr = window.devicePixelRatio || 1
    let w = Math.max(2, Math.round(box.width * dpr))
    let h = Math.max(2, Math.round(box.height * dpr))
    const long = Math.max(w, h)
    if (long > MAX_PREVIEW_LONG_SIDE) {
      w = Math.round((w * MAX_PREVIEW_LONG_SIDE) / long)
      h = Math.round((h * MAX_PREVIEW_LONG_SIDE) / long)
    }
    return { width: w, height: h }
  }, [box])

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d', { alpha: false })
      if (!canvas || !ctx) return
      const video = videoRef.current
      const hasFrame = !!video && video.readyState >= 2
      const s = sceneRef.current
      const src = hasFrame && video.videoWidth ? { ...s, srcW: video.videoWidth, srcH: video.videoHeight } : s
      renderFrame(ctx, { width: canvas.width, height: canvas.height }, src, hasFrame ? video : null, t)
    },
    [],
  )

  // ---- Media element ----
  useEffect(() => {
    setReady(false)
    setError(null)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.src = window.frameflow.media.url(project.media.path)
    videoRef.current = video
    playback.setVideo(video)
    const onLoaded = () => {
      setReady(true)
      const start = playableTime(segmentsRef.current, 0)
      const t0 = typeof start === 'number' ? start : 0
      video.currentTime = t0
      usePlayhead.getState().set({ time: t0 })
    }
    const onSeeked = () => draw(video.currentTime)
    const onError = () => setError('This video could not be played. The file may be missing or in an unsupported format.')
    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    usePlayhead.getState().set({ time: 0, playing: false })
    return () => {
      video.pause()
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
      videoRef.current = null
      playback.setVideo(null)
    }
  }, [project.media.path, draw])

  // ---- Controls ----
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const video = videoRef.current
      if (!video) return
      let t = video.currentTime
      const jump = playableTime(segmentsRef.current, t)
      if (jump === 'end' || video.ended) {
        video.pause()
        usePlayhead.getState().set({ playing: false })
        const last = segmentsRef.current[segmentsRef.current.length - 1]
        t = last ? last.end : t
        draw(Math.min(t, video.duration || t))
        usePlayhead.getState().set({ time: t })
        return
      }
      if (typeof jump === 'number') {
        // Skip drawing this tick: the old frame would be shown at the new time. 'seeked' redraws.
        video.currentTime = jump
        usePlayhead.getState().set({ time: jump })
        raf = requestAnimationFrame(tick)
        return
      }
      draw(t)
      usePlayhead.getState().set({ time: t })
      raf = requestAnimationFrame(tick)
    }
    const controls = {
      play: () => {
        const video = videoRef.current
        if (!video) return
        const at = playableTime(segmentsRef.current, video.currentTime)
        if (at === 'end') {
          const first = segmentsRef.current[0]
          video.currentTime = first ? first.start : 0
        } else if (typeof at === 'number') {
          video.currentTime = at
        }
        void video.play().then(
          () => {
            usePlayhead.getState().set({ playing: true })
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(tick)
          },
          () => usePlayhead.getState().set({ playing: false }),
        )
      },
      pause: () => {
        videoRef.current?.pause()
        cancelAnimationFrame(raf)
        usePlayhead.getState().set({ playing: false })
      },
      toggle: () => (usePlayhead.getState().playing ? controls.pause() : controls.play()),
      seek: (t: number) => {
        const video = videoRef.current
        if (!video) return
        const clamped = Math.max(0, Math.min(t, project.media.duration))
        video.currentTime = clamped
        usePlayhead.getState().set({ time: clamped })
        draw(clamped)
      },
    }
    playback.register(controls)
    return () => {
      cancelAnimationFrame(raf)
      playback.register(null)
    }
  }, [draw, project.media.duration])

  // Redraw on any visual change while paused.
  useEffect(() => {
    if (!usePlayhead.getState().playing) draw(usePlayhead.getState().time)
  }, [scene, pixelSize, ready, draw])

  // Small JPEG for the recent-projects list.
  useEffect(() => {
    setThumbnailProvider(() => {
      const canvas = canvasRef.current
      if (!canvas || !ready) return null
      const thumb = document.createElement('canvas')
      thumb.width = 384
      thumb.height = Math.round((384 * canvas.height) / canvas.width)
      thumb.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height)
      return thumb.toDataURL('image/jpeg', 0.72)
    })
    return () => setThumbnailProvider(null)
  }, [ready])

  return (
    <div ref={containerRef} className={`relative flex min-h-0 min-w-0 items-center justify-center ${className ?? ''}`}>
      <div className="relative overflow-hidden rounded-lg shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/5" style={{ width: box.width, height: box.height }}>
        <canvas
          ref={canvasRef}
          data-testid="preview-canvas"
          width={pixelSize.width}
          height={pixelSize.height}
          className="block h-full w-full cursor-pointer"
          onClick={() => playback.toggle()}
        />
        {!playing && ready && !error && (
          <button
            aria-label="Play"
            onClick={() => playback.play()}
            className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/70"
          >
            <Play size={18} fill="currentColor" />
          </button>
        )}
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading video…</div>}
        {error && <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-sm text-danger">{error}</div>}
      </div>
    </div>
  )
}

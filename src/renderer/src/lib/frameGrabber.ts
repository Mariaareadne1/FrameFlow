import { useEffect, useState } from 'react'

/**
 * Grabs real frames from a video for Moment thumbnails. Uses its own hidden <video> (never
 * the playback one), processes requests one at a time, and caches small JPEGs, so the
 * gallery of Moments never blocks the UI or decodes more than it needs.
 */
const CACHE_LIMIT = 300
const SEEK_TIMEOUT_MS = 5000
const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()
let current: { path: string; video: HTMLVideoElement } | null = null

function remember(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
}

function waitFor(video: HTMLVideoElement, event: 'seeked' | 'loadeddata'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out reading a video frame.'))
    }, SEEK_TIMEOUT_MS)
    const ok = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error('The video could not be read.'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, ok)
      video.removeEventListener('error', fail)
    }
    video.addEventListener(event, ok, { once: true })
    video.addEventListener('error', fail, { once: true })
  })
}

async function videoFor(path: string): Promise<HTMLVideoElement> {
  if (current?.path === path) return current.video
  if (current) {
    current.video.removeAttribute('src')
    current.video.load()
  }
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  current = { path, video }
  const loaded = waitFor(video, 'loadeddata')
  video.src = window.frameflow.media.url(path)
  await loaded
  return video
}

export function frameKey(path: string, t: number, width: number): string {
  return `${path}|${t.toFixed(2)}|${width}`
}

export function cachedFrame(path: string, t: number, width = 320): string | null {
  return cache.get(frameKey(path, t, width)) ?? null
}

/** Resolves to a JPEG data URL of the source frame at `t` (source seconds). */
export function grabFrame(path: string, t: number, width = 320): Promise<string> {
  const key = frameKey(path, t, width)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const job = queue.then(async () => {
    const again = cache.get(key)
    if (again) return again
    const video = await videoFor(path)
    const target = Math.max(0, Math.min(t, (video.duration || t) - 0.001))
    if (Math.abs(video.currentTime - target) > 1e-3) {
      const seeked = waitFor(video, 'seeked')
      video.currentTime = target
      await seeked
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.max(2, Math.round((width * video.videoHeight) / Math.max(1, video.videoWidth)))
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.78)
    remember(key, url)
    return url
  })
  queue = job.catch(() => undefined)
  return job
}

/** React hook: the frame at `t`, or null while it loads (or if it cannot be read). */
export function useFrame(path: string | null, t: number, width = 320): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? cachedFrame(path, t, width) : null))
  useEffect(() => {
    if (!path) return
    let alive = true
    const hit = cachedFrame(path, t, width)
    if (hit) {
      setUrl(hit)
      return
    }
    setUrl(null)
    grabFrame(path, t, width).then(
      (u) => alive && setUrl(u),
      () => alive && setUrl(null),
    )
    return () => {
      alive = false
    }
  }, [path, t, width])
  return url
}

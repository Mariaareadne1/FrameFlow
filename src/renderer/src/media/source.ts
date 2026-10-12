import { ALL_FORMATS, Input, StreamSource } from 'mediabunny'

/**
 * Opens a media file for random access through the main process. Nothing is loaded into
 * memory up front; mediabunny reads byte ranges on demand.
 */
export async function openInput(path: string): Promise<{ input: Input; close: () => Promise<void> }> {
  const api = window.frameflow
  const { handle, size } = await api.media.open(path)
  const input = new Input({
    formats: ALL_FORMATS,
    source: new StreamSource({
      getSize: () => size,
      read: (start, end) => api.media.read(handle, start, end),
      maxCacheSize: 32 * 1024 * 1024,
    }),
  })
  let closed = false
  return {
    input,
    close: async () => {
      if (closed) return
      closed = true
      input.dispose()
      await api.media.close(handle)
    },
  }
}

export interface ProbeResult {
  width: number
  height: number
  duration: number
  hasAudio: boolean
  videoCodec: string | null
}

export class UnsupportedMediaError extends Error {}

/** Reads dimensions/duration and checks the video can actually be decoded here. */
export async function probeMedia(path: string): Promise<ProbeResult> {
  const { input, close } = await openInput(path)
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null)
    if (!video) throw new UnsupportedMediaError('This file has no video track FrameFlow can read.')
    if (!(await video.canDecode())) {
      throw new UnsupportedMediaError(`This video uses a codec (${video.codec ?? 'unknown'}) that cannot be decoded on this Mac.`)
    }
    const audio = await input.getPrimaryAudioTrack().catch(() => null)
    const duration = await input.computeDuration()
    if (!Number.isFinite(duration) || duration <= 0) throw new UnsupportedMediaError('This video has no playable frames.')
    return {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      duration,
      hasAudio: !!audio && (await audio.canDecode()),
      videoCodec: video.codec,
    }
  } finally {
    await close()
  }
}

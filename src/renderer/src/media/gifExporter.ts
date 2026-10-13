import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { VideoSampleSink } from 'mediabunny'
import type { CursorTrack, Project } from '@shared/project'
import { gifDelays, gifSize } from '@shared/engine/gif'
import { keptSegments } from '@shared/engine/timeline'
import { buildScene, renderFrame } from '../engine/render'
import { ExportCancelledError, framePlan, type ExportProgress, type ExportResult } from './exporter'
import { openInput } from './source'

/**
 * Renders the project with the shared renderer into a looping GIF, streaming bytes to disk
 * frame by frame (bounded memory) — same framing, Moments, cursor and cuts as the MP4.
 */
export async function exportGif(options: {
  project: Project
  track: CursorTrack | null
  destination: string
  signal?: AbortSignal
  onProgress?: (p: ExportProgress) => void
}): Promise<ExportResult> {
  const { project, track, destination, signal, onProgress } = options
  const api = window.frameflow
  const started = performance.now()
  onProgress?.({ phase: 'preparing', fraction: 0, frame: 0, totalFrames: 0 })
  const size = gifSize(project)
  const fps = project.export.gifFps
  const segments = keptSegments(project.trims, project.media.duration)
  if (segments.length === 0) throw new Error('Everything is trimmed away — there is nothing to export.')
  const plan = framePlan(segments, fps)
  const delays = gifDelays(plan.count, fps)

  const media = await openInput(project.media.path)
  let handle: number | null = null
  let finished = false
  try {
    handle = await api.export.begin(destination)
    const writeHandle = handle
    const videoTrack = await media.input.getPrimaryVideoTrack()
    if (!videoTrack) throw new Error('The source video has no video track.')
    const first = await videoTrack.getFirstTimestamp()
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!ctx) throw new Error('Could not create a rendering surface.')
    const scene = buildScene(project, track)
    const encoder = GIFEncoder({ auto: false })
    let position = 0
    const flush = async () => {
      const bytes = encoder.bytesView()
      if (bytes.byteLength === 0) return
      await api.export.write(writeHandle, position, new Uint8Array(bytes))
      position += bytes.byteLength
      encoder.stream.reset()
    }
    encoder.writeHeader()

    const sink = new VideoSampleSink(videoTrack)
    function* timestamps() {
      for (let i = 0; i < plan.count; i++) yield plan.sourceTimeAt(i) + first
    }
    let i = 0
    let lastReport = 0
    for await (const sample of sink.samplesAtTimestamps(timestamps())) {
      if (signal?.aborted) {
        sample?.close()
        throw new ExportCancelledError()
      }
      const t = plan.sourceTimeAt(i)
      try {
        if (sample) renderFrame(ctx, size, { ...scene, srcW: sample.displayWidth, srcH: sample.displayHeight }, sample.toCanvasImageSource(), t)
        else renderFrame(ctx, size, scene, null, t)
      } finally {
        sample?.close()
      }
      const rgba = ctx.getImageData(0, 0, size.width, size.height).data
      // rgb565 keeps subtle gradients and soft effects (rgb444 bands visibly).
      const palette = quantize(rgba, 256, { format: 'rgb565' })
      const index = applyPalette(rgba, palette, 'rgb565')
      encoder.writeFrame(index, size.width, size.height, { palette, delay: delays[i]! * 10, first: i === 0, repeat: 0 })
      await flush()
      i++
      const now = performance.now()
      if (now - lastReport > 100 || i === plan.count) {
        lastReport = now
        onProgress?.({ phase: 'rendering', fraction: (i / plan.count) * 0.98, frame: i, totalFrames: plan.count })
      }
    }
    onProgress?.({ phase: 'finalizing', fraction: 0.99, frame: plan.count, totalFrames: plan.count })
    encoder.finish()
    await flush()
    await api.export.finish(writeHandle)
    finished = true
    onProgress?.({ phase: 'done', fraction: 1, frame: plan.count, totalFrames: plan.count })
    return { path: destination, width: size.width, height: size.height, duration: delays.reduce((a, b) => a + b, 0) / 100, frames: plan.count, hasAudio: false, seconds: (performance.now() - started) / 1000 }
  } finally {
    if (!finished && handle !== null) await api.export.abort(handle).catch(() => undefined)
    await media.close()
  }
}

import { AudioSampleSink, AudioSampleSource, CanvasSource, Mp4OutputFormat, Output, StreamTarget, VideoSampleSink, canEncodeAudio, canEncodeVideo, type StreamTargetChunk } from 'mediabunny'
import type { CursorTrack, Project } from '@shared/project'
import { outputSize } from '@shared/engine/layout'
import { keptSegments, outputDuration, outputToSource, type Segment } from '@shared/engine/timeline'
import { buildScene, renderFrame } from '../engine/render'
import { openInput } from './source'

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'finalizing' | 'done'
  /** 0..1 */
  fraction: number
  frame: number
  totalFrames: number
}

export interface ExportResult {
  path: string
  width: number
  height: number
  duration: number
  frames: number
  hasAudio: boolean
  seconds: number
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.')
  }
}

const WRITE_CHUNK = 8 * 1024 * 1024

export function exportBitrate(width: number, height: number, fps: number, quality: Project['export']['quality']): number {
  // ~0.09 bits/pixel/frame for "high" is visually transparent for UI content at 1080p60 (≈11 Mbps).
  const bpp = quality === 'high' ? 0.09 : 0.05
  return Math.round(Math.min(80_000_000, Math.max(4_000_000, width * height * fps * bpp)))
}

/** Frame timestamps (output seconds) and the source time each one shows. */
export function framePlan(segments: readonly Segment[], fps: number): { count: number; sourceTimeAt: (i: number) => number } {
  const total = outputDuration(segments)
  const count = Math.max(1, Math.round(total * fps))
  return { count, sourceTimeAt: (i) => outputToSource(segments, (i + 0.5) / fps) }
}

/**
 * Renders a project to an H.264 MP4. Uses the same `renderFrame` as the preview, so
 * framing, zooms, cursor and styling match exactly. Output streams straight to disk.
 */
export async function exportProject(options: {
  project: Project
  track: CursorTrack | null
  destination: string
  signal?: AbortSignal
  onProgress?: (p: ExportProgress) => void
}): Promise<ExportResult> {
  const { project, track, destination, signal, onProgress } = options
  const api = window.frameflow
  const started = performance.now()
  const report = (p: ExportProgress) => onProgress?.(p)
  report({ phase: 'preparing', fraction: 0, frame: 0, totalFrames: 0 })

  const size = outputSize(project.aspectRatio, project.export.resolution)
  const fps = project.export.fps
  const bitrate = exportBitrate(size.width, size.height, fps, project.export.quality)
  if (!(await canEncodeVideo('avc', { width: size.width, height: size.height, bitrate }))) {
    throw new Error(`This Mac cannot encode H.264 at ${size.width}×${size.height}. Try a lower resolution.`)
  }

  const media = await openInput(project.media.path)
  let handle: number | null = null
  let output: Output | null = null
  let finished = false
  try {
    handle = await api.export.begin(destination)
    const writeHandle = handle
    const videoTrack = await media.input.getPrimaryVideoTrack()
    if (!videoTrack) throw new Error('The source video has no video track.')
    const audioTrack = project.media.hasAudio ? await media.input.getPrimaryAudioTrack() : null
    const firstTimestamp = await videoTrack.getFirstTimestamp()

    const segments = keptSegments(project.trims, project.media.duration)
    if (segments.length === 0) throw new Error('Everything is trimmed away — there is nothing to export.')
    const plan = framePlan(segments, fps)

    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Could not create a rendering surface.')
    const scene = buildScene(project, track)

    let position = 0
    const writable = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => {
        await api.export.write(writeHandle, chunk.position, chunk.data)
        position = Math.max(position, chunk.position + chunk.data.byteLength)
      },
    })
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true, chunkSize: WRITE_CHUNK }),
    })
    const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate, keyFrameInterval: 2 })
    output.addVideoTrack(videoSource, { frameRate: fps })

    let audioSource: AudioSampleSource | null = null
    if (audioTrack && (await audioTrack.canDecode()) && (await canEncodeAudio('aac'))) {
      audioSource = new AudioSampleSource({ codec: 'aac', bitrate: 160_000 })
      output.addAudioTrack(audioSource)
    }
    await output.start()

    // ---- Video ----
    const sink = new VideoSampleSink(videoTrack)
    function* timestamps() {
      for (let i = 0; i < plan.count; i++) yield plan.sourceTimeAt(i) + firstTimestamp
    }
    let i = 0
    let lastReport = 0
    for await (const sample of sink.samplesAtTimestamps(timestamps())) {
      if (signal?.aborted) {
        sample?.close()
        throw new ExportCancelledError()
      }
      const t = plan.sourceTimeAt(i)
      if (sample) {
        try {
          const image = sample.toCanvasImageSource()
          renderFrame(ctx, size, { ...scene, srcW: sample.displayWidth, srcH: sample.displayHeight }, image, t)
        } finally {
          sample.close()
        }
      } else {
        renderFrame(ctx, size, scene, null, t)
      }
      await videoSource.add(i / fps, 1 / fps)
      i++
      const now = performance.now()
      if (now - lastReport > 100 || i === plan.count) {
        lastReport = now
        report({ phase: 'rendering', fraction: (i / plan.count) * (audioSource ? 0.93 : 0.97), frame: i, totalFrames: plan.count })
      }
    }
    videoSource.close()

    // ---- Audio: copy kept sections, shifted to the output timeline ----
    if (audioSource && audioTrack) {
      const audioSink = new AudioSampleSink(audioTrack)
      const audioFirst = await audioTrack.getFirstTimestamp()
      let outOffset = 0
      for (const seg of segments) {
        const from = seg.start + audioFirst
        const to = seg.end + audioFirst
        for await (const s of audioSink.samples(from, to)) {
          if (signal?.aborted) {
            s.close()
            throw new ExportCancelledError()
          }
          const startFrame = Math.max(0, Math.round((from - s.timestamp) * s.sampleRate))
          const endFrame = Math.min(s.numberOfFrames, Math.round((to - s.timestamp) * s.sampleRate))
          try {
            if (endFrame > startFrame) {
              const piece = startFrame > 0 || endFrame < s.numberOfFrames ? s.trim(startFrame, endFrame) : s.clone()
              try {
                piece.setTimestamp(outOffset + (Math.max(s.timestamp, from) - from))
                await audioSource.add(piece)
              } finally {
                piece.close()
              }
            }
          } finally {
            s.close()
          }
        }
        outOffset += seg.end - seg.start
      }
      audioSource.close()
    }

    report({ phase: 'finalizing', fraction: 0.98, frame: plan.count, totalFrames: plan.count })
    await output.finalize()
    await writable.close().catch(() => undefined)
    await api.export.finish(writeHandle)
    finished = true
    report({ phase: 'done', fraction: 1, frame: plan.count, totalFrames: plan.count })
    return {
      path: destination,
      width: size.width,
      height: size.height,
      duration: plan.count / fps,
      frames: plan.count,
      hasAudio: !!audioSource,
      seconds: (performance.now() - started) / 1000,
    }
  } catch (err) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined)
    throw err
  } finally {
    if (!finished && handle !== null) await api.export.abort(handle).catch(() => undefined)
    await media.close()
  }
}

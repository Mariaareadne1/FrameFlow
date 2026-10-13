import { AudioSample, AudioSampleSink } from 'mediabunny'
import type { Segment } from '@shared/engine/timeline'

/** One audio source to mix: its decoder, where its time zero is, and its gain. */
export interface MixInput {
  sink: AudioSampleSink
  /** The source's first timestamp; source time 0 maps to this. */
  firstTimestamp: number
  gain: number
}

export const MIX_RATE = 48_000
export const MIX_CHANNELS = 2
const BLOCK_SECONDS = 1

/**
 * Adds `input`'s audio for [from, from + frames/MIX_RATE) (source seconds) into `mix`
 * (interleaved stereo Float32). Mono sources are spread to both channels; other sample
 * rates are resampled linearly.
 */
async function accumulate(input: MixInput, from: number, frames: number, mix: Float32Array): Promise<void> {
  const to = from + frames / MIX_RATE
  const a = from + input.firstTimestamp
  const b = to + input.firstTimestamp
  for await (const s of input.sink.samples(a, b)) {
    try {
      const n = s.numberOfFrames
      const channels = Math.max(1, s.numberOfChannels)
      const planes: Float32Array[] = []
      for (let c = 0; c < Math.min(channels, MIX_CHANNELS); c++) {
        const plane = new Float32Array(n)
        s.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
        planes.push(plane)
      }
      const left = planes[0]!
      const right = planes[1] ?? left
      const ratio = s.sampleRate / MIX_RATE
      // Output frames this sample covers, relative to the block start.
      const startOut = Math.round((s.timestamp - a) * MIX_RATE)
      const outCount = Math.round(n / ratio)
      for (let i = Math.max(0, -startOut); i < outCount; i++) {
        const o = startOut + i
        if (o >= frames) break
        const srcPos = i * ratio
        const k = Math.floor(srcPos)
        const f = srcPos - k
        const k2 = Math.min(n - 1, k + 1)
        mix[2 * o] = mix[2 * o]! + input.gain * (left[k]! + (left[k2]! - left[k]!) * f)
        mix[2 * o + 1] = mix[2 * o + 1]! + input.gain * (right[k]! + (right[k2]! - right[k]!) * f)
      }
    } finally {
      s.close()
    }
  }
}

/** Soft limiter: transparent below ~0.9, smoothly bounded to ±1 above, so sums never clip harshly. */
function limit(mix: Float32Array): void {
  for (let i = 0; i < mix.length; i++) {
    const v = mix[i]!
    const a = Math.abs(v)
    if (a > 0.9) mix[i] = Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1))
  }
}

/**
 * Mixes every input over the kept segments into consecutive AudioSamples on the output
 * timeline (cuts removed). Memory stays bounded: one second of audio at a time.
 */
export async function mixSegments(options: {
  inputs: MixInput[]
  segments: readonly Segment[]
  signal?: AbortSignal
  onSample: (sample: AudioSample) => Promise<void>
  isCancelled: () => Error
}): Promise<void> {
  const { inputs, segments, signal, onSample } = options
  let outOffset = 0
  for (const seg of segments) {
    for (let blockStart = seg.start; blockStart < seg.end - 1e-6; blockStart += BLOCK_SECONDS) {
      if (signal?.aborted) throw options.isCancelled()
      const len = Math.min(BLOCK_SECONDS, seg.end - blockStart)
      const frames = Math.round(len * MIX_RATE)
      if (frames <= 0) continue
      const mix = new Float32Array(frames * MIX_CHANNELS)
      for (const input of inputs) {
        if (input.gain > 0) await accumulate(input, blockStart, frames, mix)
      }
      limit(mix)
      const sample = new AudioSample({ data: mix, format: 'f32', numberOfChannels: MIX_CHANNELS, sampleRate: MIX_RATE, timestamp: outOffset + (blockStart - seg.start) })
      try {
        await onSample(sample)
      } finally {
        sample.close()
      }
    }
    outOffset += seg.end - seg.start
  }
}

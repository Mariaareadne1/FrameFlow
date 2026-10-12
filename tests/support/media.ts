import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '../..')
export const FFMPEG = join(root, 'node_modules/ffmpeg-static/ffmpeg')
export const FFPROBE = join(root, `node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`)

export interface ProbeInfo {
  videoCodec: string
  profile: string
  width: number
  height: number
  fps: number
  duration: number
  frames: number
  audioCodec: string | null
  pixFmt: string
}

export function probe(file: string): ProbeInfo {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' })
  const json = JSON.parse(out) as { streams: Array<Record<string, string | number>>; format: Record<string, string> }
  const v = json.streams.find((s) => s.codec_type === 'video')
  if (!v) throw new Error('no video stream')
  const a = json.streams.find((s) => s.codec_type === 'audio')
  const [num, den] = String(v.avg_frame_rate).split('/').map(Number)
  return {
    videoCodec: String(v.codec_name),
    profile: String(v.profile),
    width: Number(v.width),
    height: Number(v.height),
    fps: den ? num! / den : 0,
    duration: Number(json.format.duration),
    frames: Number(v.nb_read_frames),
    audioCodec: a ? String(a.codec_name) : null,
    pixFmt: String(v.pix_fmt),
  }
}

/** Fully decodes a file; returns decoder errors (empty = clean). */
export function decodeErrors(file: string): string {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-fps_mode', 'passthrough', '-enc_time_base', '-1', '-f', 'null', '-'], { encoding: 'utf8' })
  return (r.stderr ?? '').trim()
}

export interface RgbFrame {
  width: number
  height: number
  data: Buffer
}

/** Decodes a single frame at `t` seconds as RGB24, optionally scaled. */
export function frameAt(file: string, t: number, width?: number, height?: number): RgbFrame {
  const info = width === undefined || height === undefined ? probe(file) : null
  const w = width ?? info!.width
  const h = height ?? info!.height
  const data = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1024 * 1024 * 200,
  })
  if (data.length !== w * h * 3) throw new Error(`unexpected frame size ${data.length}`)
  return { width: w, height: h, data }
}

export function savePng(file: string, t: number, dest: string, width = 960): void {
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, dest])
}

export function pixel(f: RgbFrame, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * f.width + Math.round(x)) * 3
  return [f.data[i]!, f.data[i + 1]!, f.data[i + 2]!]
}

/** Mean luminance of a rectangle. */
export function meanLuma(f: RgbFrame, x: number, y: number, w: number, h: number): number {
  let sum = 0
  let n = 0
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
      const [r, g, b] = pixel(f, xx, yy)
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      n++
    }
  }
  return sum / Math.max(1, n)
}

/** Mean absolute difference between two same-size frames, 0..255. */
export function frameDiff(a: RgbFrame, b: RgbFrame): number {
  if (a.data.length !== b.data.length) throw new Error('frame size mismatch')
  let sum = 0
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i]! - b.data[i]!)
  return sum / a.data.length
}

/** Fraction of near-black pixels (detects black frames). */
export function blackFraction(f: RgbFrame): number {
  let black = 0
  for (let i = 0; i < f.data.length; i += 3) if (f.data[i]! < 12 && f.data[i + 1]! < 12 && f.data[i + 2]! < 12) black++
  return black / (f.data.length / 3)
}

/**
 * Reads the fixture time code (see scripts/generate-fixtures.ts) from a rectangle where
 * the source's top-left 224x128 region was drawn (unzoomed). Returns seconds mod 10.
 */
export function readTimecode(f: RgbFrame, rect: { x: number; y: number; scale: number }): number {
  const level = (px: number) => {
    const l = meanLuma(f, rect.x + (px + 20) * rect.scale, rect.y + 44 * rect.scale, 40 * rect.scale, 40 * rect.scale)
    return Math.max(0, Math.min(9, Math.round((l - 20) / 22)))
  }
  return level(24) + level(120) / 10
}

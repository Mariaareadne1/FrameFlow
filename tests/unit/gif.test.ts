import { describe, expect, test } from 'vitest'
import { gifDelays, gifSize } from '@shared/engine/gif'
import { DEFAULT_EXPORT, parseProject, createProject } from '@shared/projectModel'

describe('gif export math', () => {
  test('delays keep the total duration exact', () => {
    for (const fps of [10, 15, 20]) {
      const d = gifDelays(fps * 7, fps)
      expect(d.reduce((a, b) => a + b, 0)).toBe(700)
      for (const v of d) expect(Math.abs(v - 100 / fps)).toBeLessThan(1)
    }
    expect(gifDelays(3, 15)).toEqual([7, 6, 7])
  })
  test('size follows the aspect ratio with even pixels', () => {
    const base = { export: { ...DEFAULT_EXPORT, gifWidth: 720 as const } }
    expect(gifSize({ ...base, aspectRatio: '16:9' })).toEqual({ width: 720, height: 406 })
    expect(gifSize({ ...base, aspectRatio: '1:1' })).toEqual({ width: 720, height: 720 })
    expect(gifSize({ ...base, aspectRatio: '9:16' })).toEqual({ width: 720, height: 1280 })
  })
  test('export settings default to MP4 and parse GIF options safely', () => {
    const media = { path: '/a.mp4', width: 1920, height: 1080, duration: 5, hasAudio: false, cursorPath: null, cursorEmbedded: true }
    const p = createProject({ name: 'g', media, cursorTrack: null })
    expect(p.export).toMatchObject({ format: 'mp4', gifWidth: 720, gifFps: 15 })
    const parsed = parseProject({ ...JSON.parse(JSON.stringify(p)), export: { format: 'gif', gifWidth: 999, gifFps: 15 } })
    expect(parsed.export).toMatchObject({ format: 'gif', gifWidth: 720, gifFps: 15, resolution: 1080 })
  })
})

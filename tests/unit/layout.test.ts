import { describe, expect, test } from 'vitest'
import { computeLayout, outputSize } from '@shared/engine/layout'

describe('layout', () => {
  test('output sizes for common formats at 1080p', () => {
    expect(outputSize('16:9', 1080)).toEqual({ width: 1920, height: 1080 })
    expect(outputSize('9:16', 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('1:1', 1080)).toEqual({ width: 1080, height: 1080 })
    expect(outputSize('4:3', 1080)).toEqual({ width: 1440, height: 1080 })
    expect(outputSize('16:9', 2160)).toEqual({ width: 3840, height: 2160 })
  })

  test('video keeps its aspect ratio and respects padding', () => {
    const l = computeLayout({ width: 1920, height: 1080 }, 2880, 1800, { padding: 0.1, radius: 18, shadow: 0.5, scale: 1 })
    expect(l.video.w / l.video.h).toBeCloseTo(1.6)
    expect(l.video.y).toBeCloseTo(108)
    expect(l.video.x).toBeGreaterThanOrEqual(108)
    expect(l.radius).toBeCloseTo(18)
  })

  test('portrait canvas fits a landscape recording by width', () => {
    const l = computeLayout({ width: 1080, height: 1920 }, 1920, 1080, { padding: 0.05, radius: 10, shadow: 0, scale: 1 })
    expect(l.video.w).toBeCloseTo(1080 - 108)
    expect(l.video.x + l.video.w / 2).toBeCloseTo(540)
    expect(l.video.y + l.video.h / 2).toBeCloseTo(960)
  })

  test('layout is resolution independent (preview vs export)', () => {
    const f = { padding: 0.08, radius: 18, shadow: 0.7, scale: 0.9 }
    const small = computeLayout({ width: 960, height: 540 }, 3024, 1964, f)
    const big = computeLayout({ width: 1920, height: 1080 }, 3024, 1964, f)
    expect(big.video.x).toBeCloseTo(small.video.x * 2)
    expect(big.video.w).toBeCloseTo(small.video.w * 2)
    expect(big.radius).toBeCloseTo(small.radius * 2)
  })
})

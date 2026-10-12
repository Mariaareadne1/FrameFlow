import { describe, expect, test } from 'vitest'
import { keptSegments, normalizeTrims, outputDuration, outputToSource, playableTime, sourceToOutput } from '@shared/engine/timeline'

describe('timeline', () => {
  test('no trims keeps the whole source', () => {
    const segs = keptSegments([], 10)
    expect(segs).toEqual([{ start: 0, end: 10 }])
    expect(outputDuration(segs)).toBe(10)
  })

  test('merges overlapping trims and clamps to duration', () => {
    const t = normalizeTrims(
      [
        { id: 'a', start: 2, end: 4 },
        { id: 'b', start: 3, end: 5 },
        { id: 'c', start: 9, end: 20 },
      ],
      10,
    )
    expect(t.map((x) => [x.start, x.end])).toEqual([[2, 5], [9, 10]])
  })

  test('maps output time to source time across cuts', () => {
    const segs = keptSegments([{ id: 'a', start: 2, end: 5 }], 10)
    expect(outputDuration(segs)).toBeCloseTo(7)
    expect(outputToSource(segs, 1)).toBeCloseTo(1)
    expect(outputToSource(segs, 2.5)).toBeCloseTo(5.5)
    expect(outputToSource(segs, 100)).toBeCloseTo(10)
    expect(sourceToOutput(segs, 5.5)).toBeCloseTo(2.5)
    expect(sourceToOutput(segs, 3)).toBeCloseTo(2) // inside cut -> join point
  })

  test('round trip output->source->output is identity', () => {
    const segs = keptSegments([{ id: 'a', start: 1, end: 2 }, { id: 'b', start: 6, end: 7.5 }], 12)
    for (let o = 0; o < outputDuration(segs); o += 0.37) {
      expect(sourceToOutput(segs, outputToSource(segs, o))).toBeCloseTo(o, 6)
    }
  })

  test('leading trim and playable jumps', () => {
    const segs = keptSegments([{ id: 'a', start: 0, end: 1.5 }, { id: 'b', start: 4, end: 10 }], 10)
    expect(segs).toEqual([{ start: 1.5, end: 4 }])
    expect(playableTime(segs, 0.2)).toBe(1.5)
    expect(playableTime(segs, 2)).toBeNull()
    expect(playableTime(segs, 4.2)).toBe('end')
  })

  test('drops slivers shorter than a frame', () => {
    expect(normalizeTrims([{ id: 'a', start: 1, end: 1.001 }], 10)).toEqual([])
  })
})

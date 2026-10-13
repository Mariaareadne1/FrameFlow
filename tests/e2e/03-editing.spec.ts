import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { computeLayout, outputSize } from '../../src/shared/engine/layout'
import type { FrameStyle } from '../../src/shared/project'
import { ARTIFACTS, copyFixture, exportVia, launch, openPanel, savedProject, stubOpenDialog, settledBox } from './helpers'
import { decodeErrors, frameAt, frameDiff, pixel, probe, readTimecode, savePng } from '../support/media'

const SRC_W = 1920
const SRC_H = 1200

async function seek(page: Page, t: number, duration: number): Promise<void> {
  const ruler = page.getByTestId('timeline-ruler')
  // Panels slide in and out; measure the ruler only once it has settled.
  const box = await settledBox(page, ruler)
  const before = await page.getByTestId('timecode').innerText()
  await ruler.click({ position: { x: (t / duration) * box.width, y: box.height / 2 } })
  // Let the seek land before acting at the playhead.
  await expect(page.getByTestId('timecode')).not.toHaveText(before)
  await page.waitForTimeout(100)
}

async function previewPixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(
    ({ fx, fy }) => {
      const c = document.querySelector('[data-testid="preview-canvas"]') as HTMLCanvasElement
      const d = c.getContext('2d')!.getImageData(Math.round(fx * c.width), Math.round(fy * c.height), 1, 1).data
      return [d[0]!, d[1]!, d[2]!]
    },
    { fx, fy },
  )
}

/** Where the unzoomed source's top-left lands in an export, for reading the time code. */
function sourceRect(aspect: '16:9' | '9:16' | '1:1', frame: FrameStyle, scaleTo: number) {
  const size = outputSize(aspect, 1080)
  const l = computeLayout(size, SRC_W, SRC_H, frame)
  const k = scaleTo / size.width
  return { x: l.video.x * k, y: l.video.y * k, scale: (l.video.w / SRC_W) * k, video: l.video, size }
}

test('editing: trims, manual zooms, styling — preview and exports stay in sync', async () => {
  const { app, page, dir, library } = await launch()
  try {
    const src = copyFixture(dir, 'demo-1920x1200.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await page.waitForTimeout(600)
    const duration = 30

    // --- Background change updates the preview immediately ---
    await openPanel(page, 'design')
    await page.waitForTimeout(300)
    const before = await previewPixel(page, 0.01, 0.5)
    await page.getByRole('radio', { name: 'Solid #2563eb' }).click()
    await page.waitForTimeout(150)
    const after = await previewPixel(page, 0.01, 0.5)
    expect(after).not.toEqual(before)
    expect(after[2]!).toBeGreaterThan(200)
    expect(Math.abs(after[0]! - 37)).toBeLessThan(12)

    // --- Framing: more padding moves the video inward in the preview ---
    await page.getByRole('slider', { name: 'Padding' }).fill('0.2')
    await page.waitForTimeout(150)
    const edge = await previewPixel(page, 0.5, 0.15) // inside the 20% padding band → background
    expect(edge[2]!).toBeGreaterThan(200)

    // --- Trim: cut 5s..10s via the Cut tool + inspector ---
    await openPanel(page, 'timeline')
    await seek(page, 5, duration)
    await page.getByTestId('add-cut').click()
    await expect(page.getByTestId('trim-inspector')).toBeVisible()
    await page.getByRole('textbox', { name: 'Start' }).fill('5')
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill('10')
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await expect(page.getByTestId('duration')).toHaveText('0:25.0')
    await page.keyboard.press('Escape')

    // --- Export 1: landscape, trimmed, custom background & framing, no zoom ---
    const trimmedOut = join(dir, 'trimmed.mp4')
    await exportVia(page, app, trimmedOut)
    const proj = (await savedProject(page, library)).json
    expect(proj.trims).toHaveLength(1)
    expect(proj.trims[0]).toMatchObject({ start: 5, end: 10 })
    const ti = probe(trimmedOut)
    expect(ti.duration).toBeGreaterThan(24.9)
    expect(ti.duration).toBeLessThan(25.1)
    expect(ti.frames).toBe(1500)
    expect(decodeErrors(trimmedOut)).toBe('')
    const rect = sourceRect('16:9', proj.frame, 960)
    // Output 2.0s → source 2.0s; output 6.0s → source 11.0s (after the cut); 24.5s → 29.5s.
    for (const [out, expected] of [[2.04, 2.0], [4.94, 4.9], [5.04, 10.0], [6.04, 11.0], [12.54, 17.5], [24.54, 29.5]] as const) {
      const tc = readTimecode(frameAt(trimmedOut, out, 960, 540), rect)
      expect(Math.abs(tc - (expected % 10))).toBeLessThan(0.15)
    }
    const f = frameAt(trimmedOut, 1, 960, 540)
    const bg = pixel(f, 5, 270)
    expect(bg[2]).toBeGreaterThan(200)
    // Video sits where the shared layout says it should.
    const inside = pixel(f, rect.x + 400 * rect.scale, rect.y + 900 * rect.scale)
    expect(inside[0]).toBeGreaterThan(200)
    savePng(trimmedOut, 6, join(ARTIFACTS, 'export-trimmed-custom-bg.png'))

    // --- Manual zooms on a video without cursor data ---
    await seek(page, 12, duration)
    await page.keyboard.press('z')
    await expect(page.getByTestId('moment-inspector')).toBeVisible()
    await page.keyboard.press('Escape')
    await seek(page, 20, duration)
    await page.getByTestId('add-zoom').click()
    await page.keyboard.press('Escape')
    // A zoom right at the end of the clip is clamped inside it.
    await seek(page, 29.9, duration)
    await page.keyboard.press('z')
    await page.keyboard.press('Escape')
    let p = (await savedProject(page, library)).json
    expect(p.zooms).toHaveLength(3)
    for (const z of p.zooms) {
      expect(z.focus).toEqual({ mode: 'fixed', x: 0.5, y: 0.5 })
      expect(z.end).toBeLessThanOrEqual(30)
    }

    // Move the 20s zoom by dragging it on the timeline.
    const z20 = p.zooms.find((z) => Math.abs(z.start - 20) < 0.5)!
    const block = page.getByTestId(`zoom-${z20.id}`)
    const bb = await settledBox(page, block)
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.mouse.down()
    await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2, { steps: 6 })
    await page.mouse.up()
    p = (await savedProject(page, library)).json
    const moved = p.zooms.find((z) => z.id === z20.id)!
    expect(moved.start).toBeGreaterThan(z20.start + 0.5)
    expect(moved.end - moved.start).toBeCloseTo(z20.end - z20.start, 3)

    // Resize via the inspector, then delete the end-of-clip zoom with the keyboard.
    const last = p.zooms.reduce((a, z) => (z.start > a.start ? z : a))
    await page.getByTestId(`zoom-${last.id}`).click()
    await page.keyboard.press('Backspace')
    p = (await savedProject(page, library)).json
    expect(p.zooms).toHaveLength(2)
    // Undo brings it back, redo removes it again.
    await page.getByTestId('undo').click()
    expect((await savedProject(page, library)).json.zooms).toHaveLength(3)
    await page.getByTestId('redo').click()
    p = (await savedProject(page, library)).json
    expect(p.zooms).toHaveLength(2)

    // --- Export 2: square with zooms ---
    await openPanel(page, 'design')
    await page.getByTestId('design-panel').getByRole('radio', { name: '1:1' }).click()
    const squareOut = join(dir, 'square-zooms.mp4')
    await exportVia(page, app, squareOut)
    const si = probe(squareOut)
    expect([si.width, si.height]).toEqual([1080, 1080])
    expect(decodeErrors(squareOut)).toBe('')
    p = (await savedProject(page, library)).json
    const z12 = p.zooms.find((z) => Math.abs(z.start - 12) < 0.5)!
    // During the zoom (source ~13.5s → output 8.5s) the time-code corner is zoomed out of view,
    // while before it (source 11s → output 6s) it is visible and reads correctly.
    const sq = sourceRect('1:1', p.frame, 540)
    const outMid = (z12.start + z12.end) / 2 - 5
    const zoomedFrame = frameAt(squareOut, outMid, 540, 540)
    const plainFrame = frameAt(squareOut, 6.04, 540, 540)
    expect(Math.abs(readTimecode(plainFrame, sq) - 1.0)).toBeLessThan(0.15)
    expect(frameDiff(zoomedFrame, plainFrame)).toBeGreaterThan(5)
    savePng(squareOut, outMid, join(ARTIFACTS, 'export-square-zoomed.png'), 540)
    await page.screenshot({ path: join(ARTIFACTS, 'editor-edited.png') })
  } finally {
    await app.close()
  }
})

test('edge cases: very short clip, portrait source, audio passthrough', async () => {
  const { app, page, dir } = await launch()
  try {
    // Very short clip with a zoom covering it entirely.
    const short = copyFixture(dir, 'short-1280x720.mp4')
    await stubOpenDialog(app, short)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await page.keyboard.press('z')
    await page.keyboard.press('Escape')
    const shortOut = join(dir, 'short.mp4')
    await exportVia(page, app, shortOut)
    const s = probe(shortOut)
    expect(s.frames).toBe(90)
    expect(decodeErrors(shortOut)).toBe('')

    // Portrait source in a landscape frame.
    await page.getByTestId('go-home').click()
    const portrait = copyFixture(dir, 'portrait-1080x1920.mp4')
    await stubOpenDialog(app, portrait)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('duration')).toHaveText('0:06.0')
    const pOut = join(dir, 'portrait-src.mp4')
    await exportVia(page, app, pOut)
    expect(probe(pOut)).toMatchObject({ width: 1920, height: 1080 })
    savePng(pOut, 3, join(ARTIFACTS, 'export-portrait-source.png'))

    // Audio is carried through to the export as AAC, trimmed with the video.
    await page.getByTestId('go-home').click()
    const tone = copyFixture(dir, 'tone-1280x800.mp4')
    await stubOpenDialog(app, tone)
    await page.getByTestId('import-video').click()
    await openPanel(page, 'timeline')
    await page.getByTestId('add-cut').click()
    await page.getByRole('textbox', { name: 'Start' }).fill('2')
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill('4')
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await page.keyboard.press('Escape')
    const aOut = join(dir, 'audio.mp4')
    await exportVia(page, app, aOut)
    const a = probe(aOut)
    expect(a.audioCodec).toBe('aac')
    expect(a.duration).toBeGreaterThan(5.9)
    expect(a.duration).toBeLessThan(6.15)
    expect(decodeErrors(aOut)).toBe('')
  } finally {
    await app.close()
  }
})

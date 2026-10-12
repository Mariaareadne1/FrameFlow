import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { ARTIFACTS, copyFixture, exportVia, launch, savedProject, stubOpenDialog } from './helpers'
import { blackFraction, decodeErrors, frameAt, probe, savePng } from '../support/media'

test('app starts, imports a video and exports a 1080p MP4', async () => {
  const { app, page, dir, library } = await launch()
  try {
    await expect(page.getByText('Make a demo people want to watch.')).toBeVisible()
    await expect(page.getByTestId('start-quick-demo')).toBeVisible()
    await page.screenshot({ path: join(ARTIFACTS, 'home-empty.png') })

    const src = copyFixture(dir, 'demo-1920x1200.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('advanced-editor')).toBeVisible()
    await expect(page.getByTestId('timecode')).toContainText('/ 0:30.0')
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(ARTIFACTS, 'editor-imported.png') })

    // Playback advances the playhead and the preview; pausing stops it; seeking jumps.
    const frameHash = () => page.evaluate(() => (document.querySelector('[data-testid="preview-canvas"]') as HTMLCanvasElement).toDataURL('image/jpeg', 0.5).length)
    const before = await frameHash()
    await page.getByTestId('timeline-play').click()
    await page.waitForTimeout(1500)
    await page.getByTestId('timeline-play').click()
    const playedTo = await page.getByTestId('timecode').innerText()
    const seconds = Number(/0:(\d+\.\d)/.exec(playedTo)![1])
    expect(seconds).toBeGreaterThan(0.8)
    expect(seconds).toBeLessThan(3)
    expect(await frameHash()).not.toBe(before)
    await page.waitForTimeout(500)
    expect(await page.getByTestId('timecode').innerText()).toBe(playedTo)
    const ruler = page.getByTestId('timeline-ruler')
    const box = (await ruler.boundingBox())!
    await ruler.click({ position: { x: box.width / 2, y: box.height / 2 } })
    await expect(page.getByTestId('timecode')).toContainText(/^0:1[45]\.\d/)

    const { json } = await savedProject(page, library)
    expect(json.media.path).toBe(src)
    expect(json.media.cursorEmbedded).toBe(true)
    expect(json.zooms).toEqual([])

    const out = join(dir, 'landscape.mp4')
    await exportVia(page, app, out)
    const info = probe(out)
    expect(info.videoCodec).toBe('h264')
    expect(info.width).toBe(1920)
    expect(info.height).toBe(1080)
    expect(info.fps).toBeCloseTo(60, 0)
    expect(info.duration).toBeGreaterThan(29.9)
    expect(info.duration).toBeLessThan(30.1)
    expect(info.frames).toBe(1800)
    expect(decodeErrors(out)).toBe('')
    for (const t of [0.5, 10, 29.5]) expect(blackFraction(frameAt(out, t, 480, 270))).toBeLessThan(0.05)
    savePng(out, 12.3, join(ARTIFACTS, 'export-landscape-12s.png'))
  } finally {
    await app.close()
  }
})

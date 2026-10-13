import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, exportVia, launch, openDemoProject, openPanel, savedProject, stubSaveDialog, settledBox } from './helpers'
import { decodeErrors, frameAt, frameDiff, probe, savePng } from '../support/media'

test('GIF export: same composition as MP4, exact timing, loops, cancellable', async () => {
  test.setTimeout(300_000)
  const { app, page, dir, library } = await launch()
  try {
    await openDemoProject(page, app, library, { camera: 'focus', cursorEffect: 'pulse', style: 'aura' })
    // Keep 9–14 s so the GIF covers clicks and a Moment.
    await openPanel(page, 'timeline')
    for (const [a, b] of [[0, 9], [14, 30]] as const) {
      const ruler = page.getByTestId('timeline-ruler')
      const rb = await settledBox(page, ruler)
      await ruler.click({ position: { x: ((a + 0.5) / 30) * rb.width, y: 5 } })
      await page.getByTestId('add-cut').click()
      await page.getByRole('textbox', { name: 'Start' }).fill(String(a))
      await page.getByRole('textbox', { name: 'Start' }).press('Enter')
      await page.getByRole('textbox', { name: 'End' }).fill(String(b))
      await page.getByRole('textbox', { name: 'End' }).press('Enter')
      await page.keyboard.press('Escape')
    }
    // Reference MP4 at the same width.
    await page.getByTestId('open-export').click()
    await page.getByRole('radio', { name: '720p' }).click()
    await page.getByRole('radio', { name: '30 fps' }).click()
    await page.keyboard.press('Escape')
    const mp4 = join(dir, 'ref.mp4')
    await exportVia(page, app, mp4)

    await page.getByTestId('open-export').click()
    await page.getByRole('radio', { name: 'Animated GIF' }).click()
    await page.getByRole('radio', { name: '720 px' }).click()
    await page.getByRole('radio', { name: '15 fps' }).click()
    await expect(page.getByTestId('export-start')).toHaveText('Export GIF')
    await page.screenshot({ path: join(ARTIFACTS, 'export-gif.png') })
    await page.keyboard.press('Escape')
    expect((await savedProject(page, library)).json.export).toMatchObject({ format: 'gif', gifWidth: 720, gifFps: 15 })

    const gif = join(dir, 'demo.gif')
    await exportVia(page, app, gif)
    const info = probe(gif)
    expect(info.videoCodec).toBe('gif')
    expect([info.width, info.height]).toEqual([720, 406])
    expect(info.frames).toBe(75) // 5 s × 15 fps
    expect(Math.abs(info.duration - 5)).toBeLessThan(0.05)
    expect(decodeErrors(gif)).toBe('')
    expect(readFileSync(gif).includes(Buffer.from('NETSCAPE2.0'))).toBe(true) // loops
    // Same composition as the MP4 (palette quantisation aside).
    for (const t of [0.5, 2.0, 3.6]) {
      const d = frameDiff(frameAt(gif, t, 360, 202), frameAt(mp4, t, 360, 202))
      console.log(`[gif] t=${t}s diff vs mp4 ${d.toFixed(2)}`)
      expect(d).toBeLessThan(10)
    }
    savePng(gif, 2.0, join(ARTIFACTS, 'gif-frame.png'), 720)

    // Cancelling a GIF leaves nothing behind.
    const cancelled = join(dir, 'cancelled.gif')
    await stubSaveDialog(app, cancelled)
    await page.getByTestId('open-export').click()
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-progress')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel export' }).click()
    await expect(page.getByTestId('export-start')).toBeVisible()
    expect(existsSync(cancelled)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.endsWith('.partial'))).toEqual([])
  } finally {
    await app.close()
  }
})

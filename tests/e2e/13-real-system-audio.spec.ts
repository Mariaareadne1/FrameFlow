// Real ScreenCaptureKit system-audio capture (opt-in, plays ~2 s of a quiet tone):
//   FRAMEFLOW_REAL_CAPTURE=1 npx playwright test 13
import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'
import { ROOT, exportVia, launch, savedProject } from './helpers'
import { bandLevel, decodeErrors, probe } from '../support/media'

test.skip(process.env.FRAMEFLOW_REAL_CAPTURE !== '1', 'set FRAMEFLOW_REAL_CAPTURE=1 to run real capture')

test('real window capture with system audio records the app’s sound', async () => {
  const demo = await electron.launch({ args: [join(ROOT, 'tests/demo-app/main.cjs')] })
  const demoPage = await demo.firstWindow()
  await demoPage.waitForLoadState('domcontentloaded')
  const { app, page, dir, library } = await launch()
  try {
    await page.getByTestId('record-demo').click()
    await page.getByTestId('sound-systemAudio').click()
    await page.getByRole('radio', { name: 'Windows' }).click()
    await page.getByRole('option', { name: /FrameFlow Demo Target/ }).first().click()
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText('Recording', { timeout: 15_000 })
    await demoPage.waitForTimeout(800)
    await demoPage.evaluate(() => (window as unknown as { playTone: (f: number, s: number) => void }).playTone(523, 2))
    await demoPage.waitForTimeout(3000)
    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('studio')).toBeVisible({ timeout: 30_000 })
    const { json } = await savedProject(page, library)
    expect(json.media.hasAudio).toBe(true)
    expect(probe(json.media.path).audioCodec).toBe('aac')
    const recorded = bandLevel(json.media.path, 523)
    console.log(`[system-audio] 523 Hz in recording: ${recorded.toFixed(1)} dB; 1500 Hz: ${bandLevel(json.media.path, 1500).toFixed(1)} dB`)
    expect(recorded).toBeGreaterThan(bandLevel(json.media.path, 1500) + 15)
    const out = join(dir, 'system-audio.mp4')
    await exportVia(page, app, out)
    expect(decodeErrors(out)).toBe('')
    expect(bandLevel(out, 523)).toBeGreaterThan(bandLevel(out, 1500) + 15)
  } finally {
    await app.close()
    await demo.close()
  }
})

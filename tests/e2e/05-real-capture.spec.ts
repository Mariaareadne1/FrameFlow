// Real screen capture through ScreenCaptureKit. Opt-in because it needs the Screen Recording
// permission and briefly moves the real mouse pointer:  FRAMEFLOW_REAL_CAPTURE=1 npx playwright test 05
// Only the demo window is recorded (window capture), never the rest of the desktop.
import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, ROOT, exportVia, launch, savedProject } from './helpers'
import { decodeErrors, frameAt, frameDiff, probe, savePng } from '../support/media'

const MOUSE = join(ROOT, 'native/macos/build/mouse')
const mouse = (x1: number, y1: number, x2: number, y2: number, s: number) => execFileSync(MOUSE, [x1, y1, x2, y2, s].map(String))

test.skip(process.env.FRAMEFLOW_REAL_CAPTURE !== '1', 'set FRAMEFLOW_REAL_CAPTURE=1 to run real capture')

test('real window capture of a local demo page → Quick Demo → export', async () => {
  const demo = await electron.launch({ args: [join(ROOT, 'tests/demo-app/main.cjs')] })
  const demoPage = await demo.firstWindow()
  await demoPage.waitForLoadState('domcontentloaded')
  const b = await demo.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds())
  const content = { x: b.x, y: b.y + 28 }

  const { app, page, dir, library } = await launch()
  try {
    await page.evaluate(() => localStorage.setItem('frameflow.prefs.v1', JSON.stringify({ style: 'clean', autoZoom: 'dynamic', countdown: 0, microphone: false })))
    await page.reload()
    await page.getByTestId('start-quick-demo').click()
    await page.getByRole('radio', { name: 'Windows' }).click()
    await page.getByRole('option', { name: /FrameFlow Demo Target/ }).first().click()
    await page.screenshot({ path: join(ARTIFACTS, 'record-setup-windows.png') })
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText('Recording', { timeout: 15_000 })

    // A short scripted demo: open the menu, type a name, press Create twice.
    mouse(content.x + 500, content.y + 300, content.x + 40, content.y + 28, 0.8)
    await demoPage.click('#menuBtn')
    await demoPage.waitForTimeout(1200)
    mouse(content.x + 40, content.y + 28, content.x + 400, content.y + 130, 0.8)
    await demoPage.click('#menuBtn')
    await demoPage.fill('#name', 'Launch plan')
    await demoPage.waitForTimeout(1200)
    mouse(content.x + 400, content.y + 130, content.x + 560, content.y + 130, 0.6)
    await demoPage.click('#create')
    await demoPage.waitForTimeout(600)
    await demoPage.click('#create')
    await demoPage.waitForTimeout(1500)

    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('quick-demo')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(ARTIFACTS, 'real-capture-quick-demo.png') })

    const { json } = await savedProject(page, library)
    const rec = probe(json.media.path)
    expect(rec.videoCodec).toBe('h264')
    expect(rec.duration).toBeGreaterThan(5)
    expect(decodeErrors(json.media.path)).toBe('')
    // Window content was captured at native (Retina) resolution.
    expect(rec.width).toBeGreaterThanOrEqual(b.width)
    // The recording reflects what happened in the window (the counter changed).
    expect(frameDiff(frameAt(json.media.path, 0.3, 480, 300), frameAt(json.media.path, rec.duration - 0.3, 480, 300))).toBeGreaterThan(0.1)
    // Real cursor telemetry was recorded on the same clock and normalized to the window.
    const cursor = JSON.parse(readFileSync(json.media.cursorPath!, 'utf8')) as { samples: Array<{ t: number; x: number; y: number }> }
    expect(cursor.samples.length).toBeGreaterThan(rec.duration * 40)
    const inside = cursor.samples.filter((s) => s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1)
    expect(inside.length).toBeGreaterThan(cursor.samples.length * 0.5)
    expect(json.zooms.length).toBeGreaterThan(0)

    const out = join(dir, 'real-capture.mp4')
    await exportVia(page, app, out)
    const info = probe(out)
    expect(info).toMatchObject({ videoCodec: 'h264', width: 1920, height: 1080 })
    expect(decodeErrors(out)).toBe('')
    savePng(out, Math.min(4, info.duration - 0.5), join(ARTIFACTS, 'real-capture-export.png'))
  } finally {
    await app.close()
    await demo.close()
  }
})

import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { cameraAt, effectiveZooms } from '../../src/shared/engine/camera'
import { buildCameraPath, cameraSmoothTime, parseCursorTrack } from '../../src/shared/engine/cursor'
import type { Project } from '../../src/shared/project'
import { ARTIFACTS, exportVia, launch, openPanel, savedProject } from './helpers'
import { decodeErrors, frameAt, frameDiff, pixel, probe, savePng } from '../support/media'

/** Source time where the camera is most zoomed, computed with the shared engine. */
function zoomExtremes(project: Project): { zoomed: number; scale: number } {
  const track = parseCursorTrack(JSON.parse(readFileSync(project.media.cursorPath!, 'utf8')))
  const path = track ? buildCameraPath(track.samples, project.media.duration, cameraSmoothTime(project.camera.followSmoothing), project.camera.deadzone) : null
  const zooms = effectiveZooms(project.zooms)
  let best = { zoomed: 0, scale: 1 }
  for (let t = 0.2; t < project.media.duration - 0.2; t += 0.05) {
    const s = cameraAt(zooms, path, t).scale
    if (s > best.scale) best = { zoomed: t, scale: s }
  }
  return best
}

test('Quick Demo: record → automatic Moments → export → Timeline → edit → reopen', async () => {
  // A long journey: a recording, four exports and a relaunch.
  test.setTimeout(420_000)
  const { app, page, dir, library } = await launch({ synthetic: true })
  try {
    // 1. Record a demo.
    await page.getByTestId('record-demo').click()
    await page.getByTestId('source-display:1').click()
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toBeVisible()
    await page.waitForTimeout(9000)
    await page.getByTestId('stop-recording').click()

    // 2. It opens straight into the Studio with automatic Moments and the default look.
    await expect(page.getByTestId('studio')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('moments-strip')).toContainText(/\d+ camera moves?/)
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(ARTIFACTS, 'quick-demo.png') })
    const project = (await savedProject(page, library)).json
    expect(project.version).toBe(3)
    expect(project.media.cursorEmbedded).toBe(false)
    expect(project.camera.feel).toBe('calm')
    expect(project.style).toBe('editorial')
    expect(project.cursor.effect).toBe('halo')
    expect(project.zooms.length).toBeGreaterThan(0)
    expect(project.zooms.every((z) => z.origin === 'auto')).toBe(true)
    await expect(page.locator('[data-testid^="moment-card-"]')).toHaveCount(project.zooms.length)
    const extreme = zoomExtremes(project)
    expect(extreme.scale).toBeGreaterThan(1.3)

    // 3. Export without ever opening the Timeline.
    const quickOut = join(dir, 'quick.mp4')
    await exportVia(page, app, quickOut)
    const info = probe(quickOut)
    expect(info).toMatchObject({ videoCodec: 'h264', width: 1920, height: 1080 })
    expect(Math.abs(info.duration - project.media.duration)).toBeLessThan(0.1)
    expect(decodeErrors(quickOut)).toBe('')
    savePng(quickOut, extreme.zoomed, join(ARTIFACTS, 'quick-export-zoomed.png'))

    // 4. Automatic Moments are really in the pixels: compare with the Still camera.
    await openPanel(page, 'camera')
    await page.getByTestId('feel-still').click()
    const stillOut = join(dir, 'quick-still.mp4')
    await exportVia(page, app, stillOut)
    expect(frameDiff(frameAt(quickOut, extreme.zoomed, 480, 270), frameAt(stillOut, extreme.zoomed, 480, 270))).toBeGreaterThan(8)
    expect(frameDiff(frameAt(quickOut, 0.05, 480, 270), frameAt(stillOut, 0.05, 480, 270))).toBeLessThan(3)
    await page.getByTestId('feel-calm').click()

    // 5. Quick Demo choices drive the export: Aura style in portrait.
    await openPanel(page, 'design')
    await page.getByTestId('style-aura').click()
    await page.getByTestId('design-panel').getByRole('radio', { name: '9:16' }).click()
    const portraitOut = join(dir, 'quick-portrait.mp4')
    await exportVia(page, app, portraitOut)
    const p = probe(portraitOut)
    expect([p.width, p.height]).toEqual([1080, 1920])
    const pf = frameAt(portraitOut, 1, 270, 480)
    const [r, g, b] = pixel(pf, 20, 20) // lavender bloom in the corner
    expect(b).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(140)
    savePng(portraitOut, extreme.zoomed, join(ARTIFACTS, 'quick-export-portrait.png'), 540)
    await page.getByTestId('style-editorial').click()
    await page.getByTestId('design-panel').getByRole('radio', { name: '16:9' }).click()

    // 6. The Timeline shows the very same Moments.
    await openPanel(page, 'timeline')
    await expect(page.getByTestId('studio')).toHaveAttribute('data-section', 'timeline')
    const current = (await savedProject(page, library)).json
    for (const z of current.zooms) await expect(page.getByTestId(`zoom-${z.id}`)).toBeVisible()
    await expect(page.getByTestId(`zoom-${current.zooms[0]!.id}`)).toContainText('Auto')

    // 7. Edit an automatic Moment from the Timeline: stronger and pinned.
    const target = current.zooms.reduce((a, z) => (z.end - z.start > a.end - a.start ? z : a))
    await page.getByTestId(`zoom-${target.id}`).click({ position: { x: 20, y: 10 } })
    await expect(page.getByTestId('moment-inspector')).toBeVisible()
    await page.getByRole('slider', { name: 'Zoom' }).fill('3.5')
    await page.getByRole('radio', { name: /Fixed point/ }).click()
    await page.getByTestId('focus-picker').click({ position: { x: 10, y: 10 } })
    const edited = (await savedProject(page, library)).json
    const ez = edited.zooms.find((z) => z.id === target.id)!
    expect(ez).toMatchObject({ scale: 3.5, origin: 'manual' })
    expect(ez.focus.mode).toBe('fixed')
    const editedOut = join(dir, 'edited.mp4')
    await exportVia(page, app, editedOut)
    const mid = (ez.start + ez.end) / 2
    expect(frameDiff(frameAt(editedOut, mid, 480, 270), frameAt(quickOut, mid, 480, 270))).toBeGreaterThan(8)

    // 8. Undo / redo.
    await page.keyboard.press('Escape')
    await page.getByTestId('undo').click()
    await page.getByTestId('redo').click()

    // 9. Quit, relaunch, reopen from the gallery: the edit is intact.
    await page.getByTestId('go-home').click()
    await app.close()
    const relaunched = await launch({ synthetic: true, dir })
    try {
      const rp = relaunched.page
      await expect(rp.getByTestId('recent-projects')).toBeVisible()
      await rp.locator('[data-testid="project-card"] button').first().click()
      await expect(rp.getByTestId('studio')).toHaveAttribute('data-section', 'timeline')
      await rp.getByTestId(`zoom-${target.id}`).click({ position: { x: 20, y: 10 } })
      await expect(rp.getByRole('slider', { name: 'Zoom' })).toHaveValue('3.5')
      expect((await savedProject(rp, relaunched.library)).json.zooms).toEqual(edited.zooms)
    } finally {
      await relaunched.app.close()
    }
  } finally {
    await app.close().catch(() => undefined)
  }
})

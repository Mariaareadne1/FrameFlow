import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { cameraAt, effectiveZooms } from '../../src/shared/engine/camera'
import { CAMERA_SMOOTH_TIME, buildSmoothPath, parseCursorTrack } from '../../src/shared/engine/cursor'
import { readFileSync } from 'node:fs'
import type { Project } from '../../src/shared/project'
import { ARTIFACTS, exportVia, launch, savedProject } from './helpers'
import { decodeErrors, frameAt, frameDiff, pixel, probe, savePng } from '../support/media'

/** Times (source seconds) where the camera is most and least zoomed. */
function zoomExtremes(project: Project): { zoomed: number; scale: number } {
  const track = parseCursorTrack(JSON.parse(readFileSync(project.media.cursorPath!, 'utf8')))
  const path = track ? buildSmoothPath(track.samples, project.media.duration, CAMERA_SMOOTH_TIME) : null
  const zooms = effectiveZooms(project.zooms)
  let best = { zoomed: 0, scale: 1 }
  for (let t = 0.2; t < project.media.duration - 0.2; t += 0.05) {
    const s = cameraAt(zooms, path, t).scale
    if (s > best.scale) best = { zoomed: t, scale: s }
  }
  return best
}


test('Quick Demo: record → automatic edits → export → advanced editor → edit → reopen', async () => {
  const { app, page, dir, library } = await launch({ synthetic: true })
  try {
    // 1. Record with the Quick Demo flow.
    await page.getByTestId('start-quick-demo').click()
    await page.getByTestId('source-display:1').click()
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toBeVisible()
    await page.waitForTimeout(9000)
    await page.getByTestId('stop-recording').click()

    // 2. The app processes the recording and lands in Quick Demo with automatic zooms.
    await expect(page.getByTestId('quick-demo')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('quick-controls')).toContainText(/FrameFlow added \d+ zoom/)
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(ARTIFACTS, 'quick-demo.png') })
    const first = await savedProject(page, library)
    const project = first.json
    expect(project.media.cursorEmbedded).toBe(false)
    expect(project.media.cursorPath).toBeTruthy()
    expect(project.autoZoom).toBe('subtle')
    expect(project.zooms.length).toBeGreaterThan(0)
    expect(project.zooms.every((z) => z.origin === 'auto')).toBe(true)
    expect(project.media.duration).toBeGreaterThan(6)
    const extreme = zoomExtremes(project)
    expect(extreme.scale).toBeGreaterThan(1.3)

    // 3. Export straight from Quick Demo.
    const quickOut = join(dir, 'quick.mp4')
    await exportVia(page, app, quickOut)
    const info = probe(quickOut)
    expect(info).toMatchObject({ videoCodec: 'h264', width: 1920, height: 1080 })
    expect(Math.abs(info.duration - project.media.duration)).toBeLessThan(0.1)
    expect(decodeErrors(quickOut)).toBe('')
    savePng(quickOut, extreme.zoomed, join(ARTIFACTS, 'quick-export-zoomed.png'))

    // 4. Automatic zooms are really in the video: compare against the same project with auto zoom off.
    await page.getByRole('radio', { name: 'Off' }).click()
    const flatOut = join(dir, 'quick-nozoom.mp4')
    await exportVia(page, app, flatOut)
    const zoomedFrame = frameAt(quickOut, extreme.zoomed, 480, 270)
    const flatFrame = frameAt(flatOut, extreme.zoomed, 480, 270)
    expect(frameDiff(zoomedFrame, flatFrame)).toBeGreaterThan(8)
    // At the very start no zoom is active in either export, so frames match.
    expect(frameDiff(frameAt(quickOut, 0.05, 480, 270), frameAt(flatOut, 0.05, 480, 270))).toBeLessThan(3)
    await page.getByRole('radio', { name: 'Subtle' }).click()

    // 5. Quick Demo settings drive the export: Colorful style in portrait.
    await page.getByTestId('style-colorful').click()
    await page.getByRole('radio', { name: '9:16' }).click()
    const portraitOut = join(dir, 'quick-portrait.mp4')
    await exportVia(page, app, portraitOut)
    const p = probe(portraitOut)
    expect([p.width, p.height]).toEqual([1080, 1920])
    const pf = frameAt(portraitOut, 1, 270, 480)
    const [r, , b] = pixel(pf, 135, 470) // bottom edge: warm end of the "Dusk" gradient
    expect(r).toBeGreaterThan(b + 40)
    savePng(portraitOut, extreme.zoomed, join(ARTIFACTS, 'quick-export-portrait.png'), 540)
    await page.getByTestId('style-clean').click()
    await page.getByRole('radio', { name: '16:9' }).click()

    // 6. Advanced Editor shows the same automatic zooms on the timeline.
    await page.getByTestId('open-advanced').click()
    await expect(page.getByTestId('advanced-editor')).toBeVisible()
    const current = (await savedProject(page, library)).json
    const autoIds = current.zooms.map((z) => z.id)
    for (const id of autoIds) await expect(page.getByTestId(`zoom-${id}`)).toBeVisible()
    await expect(page.getByTestId(`zoom-${autoIds[0]}`)).toContainText('Auto')
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(ARTIFACTS, 'advanced-from-quick.png') })

    // 7. Edit an automatic zoom: make it much stronger and pin its focus.
    const target = current.zooms.reduce((a, z) => (z.end - z.start > a.end - a.start ? z : a))
    await page.getByTestId(`zoom-${target.id}`).click({ position: { x: 20, y: 10 } })
    await expect(page.getByTestId('zoom-inspector')).toBeVisible()
    await page.getByRole('slider', { name: 'Zoom level' }).fill('3.5')
    await page.getByRole('radio', { name: /Fixed point/ }).click()
    await page.getByTestId('focus-picker').click({ position: { x: 10, y: 10 } })
    await page.screenshot({ path: join(ARTIFACTS, 'advanced-zoom-inspector.png') })
    const edited = (await savedProject(page, library)).json
    const ez = edited.zooms.find((z) => z.id === target.id)!
    expect(ez.scale).toBeCloseTo(3.5)
    expect(ez.origin).toBe('manual')
    expect(ez.focus.mode).toBe('fixed')

    const editedOut = join(dir, 'edited.mp4')
    await exportVia(page, app, editedOut)
    const mid = (ez.start + ez.end) / 2
    expect(frameDiff(frameAt(editedOut, mid, 480, 270), frameAt(quickOut, mid, 480, 270))).toBeGreaterThan(8)
    savePng(editedOut, mid, join(ARTIFACTS, 'edited-zoom-3.5x.png'))

    // 8. Undo/redo work on that edit.
    await page.keyboard.press('Escape')
    await page.getByTestId('undo').click()
    await page.getByTestId('redo').click()

    // 9. Save, quit, relaunch and reopen from Recent Projects.
    await page.getByTestId('go-home').click()
    await app.close()
    const relaunched = await launch({ synthetic: true, dir })
    try {
      const rp = relaunched.page
      await expect(rp.getByTestId('recent-projects')).toBeVisible()
      await rp.screenshot({ path: join(ARTIFACTS, 'home-with-recents.png') })
      await rp.getByTestId('recent-projects').getByRole('button').first().click()
      await expect(rp.getByTestId('advanced-editor')).toBeVisible()
      await rp.getByTestId(`zoom-${target.id}`).click({ position: { x: 20, y: 10 } })
      await expect(rp.getByRole('slider', { name: 'Zoom level' })).toHaveValue('3.5')
      const reopened = (await savedProject(rp, relaunched.library)).json
      expect(reopened.zooms).toEqual(edited.zooms)
    } finally {
      await relaunched.app.close()
    }
  } finally {
    await app.close().catch(() => undefined)
  }
})

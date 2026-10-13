import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cameraAt, effectiveZooms, projectToViewport, viewportOf } from '../../src/shared/engine/camera'
import { buildCameraPath, cameraSmoothTime, parseCursorTrack } from '../../src/shared/engine/cursor'
import { computeLayout, outputSize } from '../../src/shared/engine/layout'
import type { Project } from '../../src/shared/project'
import { ARTIFACTS, exportVia, launch, openDemoProject, openPanel, savedProject } from './helpers'
import { frameAt, meanLuma, pixel, savePng, type RgbFrame } from '../support/media'

const isCoral = ([r, g, b]: [number, number, number]) => r > 170 && g > 95 && g < 150 && b > 75 && b < 135 && r - b > 60

function coralNear(f: RgbFrame, x: number, y: number, radius: number): number {
  let n = 0
  for (let yy = Math.round(y - radius); yy <= y + radius; yy++) {
    for (let xx = Math.round(x - radius); xx <= x + radius; xx++) {
      if (xx < 0 || yy < 0 || xx >= f.width || yy >= f.height) continue
      if (isCoral(pixel(f, xx, yy))) n++
    }
  }
  return n
}

test('captions and arrows render into the export, follow the camera, and persist', async () => {
  test.setTimeout(300_000)
  const { app, page, dir, library } = await launch()
  try {
    await openDemoProject(page, app, library, { camera: 'calm', cursorEffect: 'natural' })
    await page.getByTestId('open-export').click()
    await page.getByRole('radio', { name: '720p' }).click()
    await page.getByRole('radio', { name: '30 fps' }).click()
    await page.keyboard.press('Escape')
    const plain = join(dir, 'plain.mp4')
    await exportVia(page, app, plain)

    // Annotate the second Moment: a bottom caption and an arrow at its focus point.
    const before = (await savedProject(page, library)).json
    const z = before.zooms[1]!
    await page.getByTestId(`moment-card-${z.id}`).click()
    await page.getByTestId('moment-caption').fill('Fill in the form')
    await page.getByTestId('moment-caption').press('Enter')
    await page.getByRole('switch', { name: 'Arrow' }).click()
    await expect(page.getByTestId('pointer-picker')).toBeVisible()
    await expect(page.getByTestId(`moment-card-${z.id}`)).toContainText('Note')
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(ARTIFACTS, 'moment-note.png') })
    const p = (await savedProject(page, library)).json as Project
    const zn = p.zooms.find((q) => q.id === z.id)!
    expect(zn).toMatchObject({ caption: 'Fill in the form', captionPosition: 'bottom', origin: 'manual' })
    expect(zn.pointer).toBeTruthy()

    const noted = join(dir, 'noted.mp4')
    await exportVia(page, app, noted)
    const size = outputSize('16:9', 720)
    const layout = computeLayout(size, 1920, 1200, p.frame)
    const v = layout.video
    const mid = (zn.start + zn.end) / 2
    // Caption pill: bottom-centre of the video becomes dark ink during the Moment only.
    // Sample the pill's top padding (above the light caption text): a single-line pill is fs * 2 tall.
    const fs = 0.034 * 720
    const pillTop = v.y + v.h * 0.95 - 2 * fs
    const capLuma = (file: string, t: number) => meanLuma(frameAt(file, t, size.width, size.height), v.x + v.w / 2 - 40, pillTop + 2, 80, 6)
    expect(capLuma(plain, mid)).toBeGreaterThan(200)
    expect(capLuma(noted, mid)).toBeLessThan(90)
    expect(Math.abs(capLuma(noted, Math.max(0.2, zn.start - 0.5)) - capLuma(plain, Math.max(0.2, zn.start - 0.5)))).toBeLessThan(3)

    // Arrow: coral pixels near the tip predicted by the shared camera engine (it zooms with the footage).
    const track = parseCursorTrack(JSON.parse(readFileSync(p.media.cursorPath!, 'utf8')))!
    const cam = cameraAt(effectiveZooms(p.zooms), buildCameraPath(track.samples, 30, cameraSmoothTime(p.camera.followSmoothing), p.camera.deadzone), mid, p.camera.minHandoff)
    expect(cam.scale).toBeGreaterThan(1.3)
    const tip = projectToViewport(zn.pointer!, viewportOf(cam))
    const tx = v.x + tip.x * v.w
    const ty = v.y + tip.y * v.h
    const notedFrame = frameAt(noted, mid, size.width, size.height)
    expect(coralNear(notedFrame, tx, ty, 26)).toBeGreaterThan(20)
    expect(coralNear(frameAt(plain, mid, size.width, size.height), tx, ty, 26)).toBe(0)
    savePng(noted, mid, join(ARTIFACTS, 'annotations-export.png'), 960)

    // Reopen: the note survives; a Moment with camera off still shows its caption.
    await page.getByRole('switch', { name: 'Camera movement' }).click()
    const off = join(dir, 'camera-off.mp4')
    await exportVia(page, app, off)
    expect(capLuma(off, mid)).toBeLessThan(90)
    await page.getByTestId('go-home').click()
    await page.locator('[data-testid="project-card"] button').first().click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await openPanel(page, 'moments')
    const reopened = (await savedProject(page, library)).json
    expect(reopened.zooms.find((q) => q.id === z.id)).toMatchObject({ caption: 'Fill in the form', disabled: true })
  } finally {
    await app.close()
  }
})

import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cameraAt, effectiveZooms } from '../../src/shared/engine/camera'
import { buildCameraPath, cameraSmoothTime, parseCursorTrack } from '../../src/shared/engine/cursor'
import { join } from 'node:path'
import { computeLayout, outputSize } from '../../src/shared/engine/layout'
import type { Project } from '../../src/shared/project'
import { STYLE_PRESETS } from '../../src/shared/styles'
import { ARTIFACTS, exportVia, launch, openDemoProject, openPanel, savedProject, settledBox } from './helpers'
import { FFMPEG, decodeErrors, frameAt, frameDiff, meanLuma, pixel, probe, savePng, type RgbFrame } from '../support/media'

/** Cut the 30 s demo down to 8–13 s (three clicks) and export at 720p30 to keep the suite fast. */
async function prepareShortExport(page: Page): Promise<void> {
  await openPanel(page, 'timeline')
  for (const [a, b] of [[0, 8], [13, 30]] as const) {
    // Put the playhead inside the range first so each Cut is a new one.
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
  await page.getByTestId('open-export').click()
  await page.getByRole('radio', { name: '720p' }).click()
  await page.getByRole('radio', { name: '30 fps' }).click()
  await page.keyboard.press('Escape')
}

function stdDevLuma(f: RgbFrame, x: number, y: number, w: number, h: number): number {
  const vals: number[] = []
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const [r, g, b] = pixel(f, xx, yy)
    vals.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
}

test('visual styles: five art directions render distinctly into real exports', async () => {
  test.setTimeout(400_000)
  const { app, page, dir, library } = await launch()
  try {
    await openDemoProject(page, app, library, { camera: 'calm' })
    await prepareShortExport(page)
    const corner: Record<string, [number, number, number]> = {}
    for (const s of STYLE_PRESETS) {
      await openPanel(page, 'design')
      await page.getByTestId(`style-${s.id}`).click()
      const proj = (await savedProject(page, library)).json
      expect(proj.style).toBe(s.id)
      expect(proj.frame).toEqual(s.frame)
      const out = join(dir, `style-${s.id}.mp4`)
      await exportVia(page, app, out)
      const info = probe(out)
      expect(info).toMatchObject({ videoCodec: 'h264', width: 1280, height: 720 })
      expect(info.frames).toBe(150)
      expect(decodeErrors(out)).toBe('')
      const f = frameAt(out, 0.5, 640, 360)
      corner[s.id] = pixel(f, 8, 180)
      savePng(out, 2.5, join(ARTIFACTS, `style-${s.id}.png`), 640)
      if (s.id === 'canvas') {
        // Paper grain: visible texture in the backdrop, identical in two decodes of different frames.
        expect(stdDevLuma(f, 4, 120, 30, 120)).toBeGreaterThan(1.2)
        const g = frameAt(out, 3.5, 640, 360)
        expect(frameDiff({ ...f, data: f.data.subarray(0, 640 * 3 * 20) }, { ...g, data: g.data.subarray(0, 640 * 3 * 20) })).toBeLessThan(1.5)
      }
    }
    const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    expect(lum(corner.midnight!)).toBeLessThan(40) // dark
    expect(lum(corner.editorial!)).toBeGreaterThan(200) // light ivory
    expect(corner.editorial![0]).toBeGreaterThan(corner.editorial![2]) // warm
    expect(corner.studio![2]).toBeGreaterThanOrEqual(corner.studio![0] - 4) // neutral/cool
    expect(corner.aura![2]).toBeGreaterThan(corner.aura![1]) // lavender
    expect(corner.canvas![0] - corner.canvas![2]).toBeGreaterThan(corner.editorial![0] - corner.editorial![2]) // warmer paper

    // Custom adjustments after a preset, across aspect ratios.
    await page.getByTestId('style-editorial').click()
    await page.getByRole('slider', { name: 'Padding' }).fill('0.2')
    expect((await savedProject(page, library)).json.style).toBe('custom')
    await page.getByTestId('design-panel').getByRole('radio', { name: '9:16' }).click()
    const portrait = join(dir, 'custom-portrait.mp4')
    await exportVia(page, app, portrait)
    expect(probe(portrait)).toMatchObject({ width: 720, height: 1280 })
    await page.getByTestId('design-panel').getByRole('radio', { name: '1:1' }).click()
    const square = join(dir, 'custom-square.mp4')
    await exportVia(page, app, square)
    expect(probe(square)).toMatchObject({ width: 720, height: 720 })
    const proj = (await savedProject(page, library)).json as Project
    const l = computeLayout(outputSize('1:1', 720), 1920, 1200, proj.frame)
    const sq = frameAt(square, 1, 720, 720)
    expect(lum(pixel(sq, 360, l.video.y - 25))).toBeGreaterThan(200) // padding band is backdrop
  } finally {
    await app.close()
  }
})

test('camera feel and cursor treatments change the real exported frames', async () => {
  test.setTimeout(500_000)
  const { app, page, dir, library } = await launch()
  try {
    const project = await openDemoProject(page, app, library, { camera: 'still', cursorEffect: 'natural' })
    await prepareShortExport(page)
    // Camera predicted by the shared engine from the saved project, at a source time.
    const track = parseCursorTrack(JSON.parse(readFileSync(project.media.cursorPath!, 'utf8')))!
    const cameraOf = (p: Project, t: number) => cameraAt(effectiveZooms(p.zooms), buildCameraPath(track.samples, 30, cameraSmoothTime(p.camera.followSmoothing), p.camera.deadzone), t)
    const exportFeel = async (feel: string) => {
      await openPanel(page, 'camera')
      await page.getByTestId(`feel-${feel}`).click()
      const out = join(dir, `feel-${feel}.mp4`)
      await exportVia(page, app, out)
      expect(decodeErrors(out)).toBe('')
      return { out, project: (await savedProject(page, library)).json as Project }
    }
    const still = await exportFeel('still')
    const calm = await exportFeel('calm')
    const follow = await exportFeel('follow')
    const focus = await exportFeel('focus')
    // Source 8–13 s survives the cuts, so output t = source − 8. Sample every 0.25 s.
    const samples = Array.from({ length: 19 }, (_, i) => 8.25 + i * 0.25)
    let maxCalm = 1
    let maxFocus = 1
    let followTravel = 0
    let calmTravel = 0
    let prevF = cameraOf(follow.project, 8)
    let prevC = cameraOf(calm.project, 8)
    for (const t of samples) {
      const c = cameraOf(calm.project, t)
      const fo = cameraOf(focus.project, t)
      const fl = cameraOf(follow.project, t)
      maxCalm = Math.max(maxCalm, c.scale)
      maxFocus = Math.max(maxFocus, fo.scale)
      followTravel += Math.hypot(fl.cx - prevF.cx, fl.cy - prevF.cy)
      calmTravel += Math.hypot(c.cx - prevC.cx, c.cy - prevC.cy)
      prevF = fl
      prevC = c
      // Exported pixels follow the engine: zoomed where it says so, identical to Still where not.
      for (const [name, v, cam] of [['calm', calm, c], ['focus', focus, fo], ['follow', follow, fl]] as const) {
        const diff = frameDiff(frameAt(v.out, t - 8, 320, 180), frameAt(still.out, t - 8, 320, 180))
        if (cam.scale > 1.08) expect(diff, `${name} at ${t}s (scale ${cam.scale.toFixed(2)})`).toBeGreaterThan(2)
        if (cam.scale < 1.001) expect(diff, `${name} at ${t}s should match Still`).toBeLessThan(1.2)
      }
    }
    expect(maxCalm).toBeGreaterThan(1.3)
    expect(maxFocus).toBeGreaterThan(maxCalm + 0.4)
    expect(followTravel).toBeGreaterThan(calmTravel)
    for (const [name, f] of [['still', still], ['calm', calm], ['follow', follow], ['focus', focus]] as const) savePng(f.out, 2.9, join(ARTIFACTS, `feel-${name}.png`), 640)

    // Cursor treatments, with the camera still so positions are fixed in the frame.
    await page.getByTestId('feel-still').click()
    const exportCursor = async (effect: string) => {
      await openPanel(page, 'cursor')
      await page.getByTestId(`cursor-${effect}`).click()
      const out = join(dir, `cursor-${effect}.mp4`)
      await exportVia(page, app, out)
      return out
    }
    const natural = await exportCursor('natural')
    const halo = await exportCursor('halo')
    const spotlight = await exportCursor('spotlight')
    const pulse = await exportCursor('pulse')
    const proj = (await savedProject(page, library)).json as Project
    expect(proj.cursor.effect).toBe('pulse')
    expect(proj.zooms.filter((z) => z.origin === 'manual')).toEqual(project.zooms.filter((z) => z.origin === 'manual'))

    // Crop helpers around the click at source 10.65 s (x .6, y .48), output 2.65 s.
    const l = computeLayout(outputSize('16:9', 720), 1920, 1200, proj.frame)
    const cx = l.video.x + 0.6 * l.video.w
    const cy = l.video.y + 0.48 * l.video.h
    const near = (f: string, t: number) => {
      const fr = frameAt(f, t, 1280, 720)
      return meanLuma(fr, cx - 40, cy - 40, 80, 80)
    }
    const far = (f: string, t: number) => meanLuma(frameAt(f, t, 1280, 720), l.video.x + 20, l.video.y + l.video.h - 120, 160, 100)
    const click = 2.65 + 0.12
    // Halo: always present around the pointer; Pulse: a ring only right after clicks;
    // Spotlight: darkens the frame away from the click, only around clicks.
    expect(Math.abs(near(halo, click) - near(natural, click))).toBeGreaterThan(1.5)
    expect(Math.abs(near(pulse, click) - near(natural, click))).toBeGreaterThan(1.5)
    expect(far(natural, click + 0.25) - far(spotlight, click + 0.25)).toBeGreaterThan(8)
    expect(Math.abs(far(natural, 0.3) - far(spotlight, 0.3))).toBeLessThan(1.5) // no click → no dimming
    expect(Math.abs(near(pulse, 3.8) - near(natural, 3.8))).toBeLessThan(1) // ripple long gone
    for (const [n, f] of [['natural', natural], ['halo', halo], ['spotlight', spotlight], ['pulse', pulse]] as const) savePng(f, click + 0.2, join(ARTIFACTS, `cursor-${n}.png`), 640)
  } finally {
    await app.close()
  }
})

test('preview matches export frame-for-frame (style, Moments, cursor, cuts)', async () => {
  test.setTimeout(300_000)
  const { app, page, dir, library } = await launch()
  try {
    await openDemoProject(page, app, library, { camera: 'focus', cursorEffect: 'halo', style: 'aura' })
    await openPanel(page, 'timeline')
    await page.getByTestId('add-cut').click()
    await page.getByRole('textbox', { name: 'Start' }).fill('0')
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill('8')
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await page.keyboard.press('Escape')
    await openPanel(page, 'moments')
    const out = join(dir, 'parity.mp4')
    await exportVia(page, app, out)
    // Compare at moments mid-zoom, mid-transition and with no zoom (source 10.2, 11.0, 20.5).
    for (const src of [10.2, 11.0, 20.5]) {
      const scrubber = page.getByTestId('scrubber')
      const box = (await scrubber.boundingBox())!
      await scrubber.click({ position: { x: ((src - 8) / 22) * box.width, y: box.height / 2 } })
      await page.waitForTimeout(500)
      const shown = await page.getByTestId('timecode').innerText()
      const [m, s] = shown.split(':').map(Number)
      const outT = m! * 60 + s!
      const png = await page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png'))
      const file = join(dir, `preview-${src}.png`)
      execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, Buffer.from(process.argv[1].split(',')[1], 'base64'))`, png])
      const W = 640
      const H = 360
      const preview = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
      const exported = frameAt(out, outT + 0.01, W, H)
      const diff = frameDiff({ width: W, height: H, data: preview }, exported)
      console.log(`[parity] source ${src}s → output ${outT}s: mean abs diff ${diff.toFixed(2)}`)
      expect(diff).toBeLessThan(6)
    }
  } finally {
    await app.close()
  }
})

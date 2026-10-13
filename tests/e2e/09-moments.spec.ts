import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { ARTIFACTS, exportVia, launch, openDemoProject, openPanel, savedProject, settledBox } from './helpers'
import { decodeErrors, frameAt, frameDiff, probe } from '../support/media'

/** Reads the fixture time code (seconds mod 10) out of a Moment thumbnail. */
async function thumbTimecode(page: Page, cardId: string): Promise<number> {
  const img = page.getByTestId(`moment-card-${cardId}`).getByTestId('moment-thumb')
  await img.waitFor()
  return img.evaluate(async (el: HTMLImageElement) => {
    await el.decode()
    const c = document.createElement('canvas')
    c.width = el.naturalWidth
    c.height = el.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(el, 0, 0)
    const k = c.width / 1920
    const level = (px: number) => {
      const d = ctx.getImageData(Math.round((px + 22) * k), Math.round(46 * k), Math.max(2, Math.round(36 * k)), Math.max(2, Math.round(36 * k))).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
      return Math.max(0, Math.min(9, Math.round((sum / (d.length / 4) - 20) / 22)))
    }
    return level(24) + level(120) / 10
  })
}

test('Moments: real thumbnails, seeking, editing, feel changes, cuts and Timeline sync', async () => {
  test.setTimeout(300_000)
  const { app, page, dir, library } = await launch()
  try {
    const project = await openDemoProject(page, app, library, { camera: 'calm' })
    const zooms = project.zooms
    expect(zooms.length).toBe(3)
    const cards = page.locator('[data-testid^="moment-card-"]')
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toContainText('Moment 01')
    await expect(cards.nth(0)).toContainText(/Click at 0:0\d/)

    // Thumbnails are real frames from each Moment's own time.
    for (const z of zooms) {
      const t = Number(await page.getByTestId(`moment-card-${z.id}`).getAttribute('data-moment-time'))
      const tc = await thumbTimecode(page, z.id)
      expect(Math.abs(tc - (Math.floor(t * 10) / 10) % 10)).toBeLessThan(0.15)
    }
    await page.screenshot({ path: join(ARTIFACTS, 'moments-strip.png') })

    // Selecting a Moment seeks the preview there and opens its inspector.
    const second = zooms[1]!
    await page.getByTestId(`moment-card-${second.id}`).click()
    await expect(page.getByTestId('moment-inspector')).toBeVisible()
    const focusT = Number(await page.getByTestId(`moment-card-${second.id}`).getAttribute('data-moment-time'))
    const shown = await page.getByTestId('timecode').innerText()
    const [m, s] = shown.split(':').map(Number)
    expect(Math.abs(m! * 60 + s! - focusT)).toBeLessThan(0.15)

    // Rename + stronger zoom: the underlying ZoomEvent changes and becomes manual.
    await page.getByTestId('moment-name').fill('Fill in the form')
    await page.getByTestId('moment-name').press('Enter')
    await page.getByRole('slider', { name: 'Zoom' }).fill('2.6')
    await expect(page.getByTestId(`moment-card-${second.id}`)).toContainText('Fill in the form')
    let saved = (await savedProject(page, library)).json
    expect(saved.zooms.find((z) => z.id === second.id)).toMatchObject({ label: 'Fill in the form', scale: 2.6, origin: 'manual' })
    await page.screenshot({ path: join(ARTIFACTS, 'moment-edited.png') })

    // Changing the camera feel regenerates only the untouched automatic Moments.
    await openPanel(page, 'camera')
    await page.getByTestId('feel-focus').click()
    saved = (await savedProject(page, library)).json
    expect(saved.camera.feel).toBe('focus')
    expect(saved.zooms.find((z) => z.id === second.id)).toMatchObject({ label: 'Fill in the form', scale: 2.6 })
    expect(saved.zooms.filter((z) => z.origin === 'auto').every((z) => z.easing === 'crisp')).toBe(true)
    await page.getByTestId('feel-calm').click()
    await openPanel(page, 'moments')

    // Disable, then delete + undo/redo the first Moment.
    const first = (await savedProject(page, library)).json.zooms[0]!
    await page.getByTestId(`moment-card-${first.id}`).click()
    await page.getByRole('switch', { name: 'Camera movement' }).click()
    await expect(page.getByTestId(`moment-card-${first.id}`)).toContainText('Camera off')
    expect((await savedProject(page, library)).json.zooms.find((z) => z.id === first.id)?.disabled).toBe(true)
    await page.getByTestId('delete-zoom').click()
    await expect(page.getByTestId(`moment-card-${first.id}`)).toHaveCount(0)
    await page.getByTestId('undo').click()
    await expect(page.getByTestId(`moment-card-${first.id}`)).toBeVisible()
    await page.getByTestId('redo').click()
    await expect(page.getByTestId(`moment-card-${first.id}`)).toHaveCount(0)
    await page.getByTestId('undo').click()

    // Add a Moment manually at the playhead.
    const before = (await savedProject(page, library)).json.zooms.length
    await page.getByTestId('add-moment').click()
    await expect(page.getByTestId('moment-inspector')).toBeVisible()
    saved = (await savedProject(page, library)).json
    expect(saved.zooms.length).toBe(before + 1)
    expect(saved.zooms.filter((z) => z.origin === 'manual').length).toBeGreaterThanOrEqual(2)
    await page.keyboard.press('Escape')

    // Cuts: a cut before a Moment shifts its card time but never its source time; a Moment
    // entirely inside a cut is shown as cut.
    const target = saved.zooms.find((z) => z.id === second.id)!
    const timeBefore = await page.getByTestId(`moment-card-${second.id}`).getAttribute('data-moment-time')
    await openPanel(page, 'timeline')
    await page.getByTestId('timeline-ruler').click({ position: { x: 2, y: 5 } })
    await page.getByTestId('add-cut').click()
    await page.getByRole('textbox', { name: 'Start' }).fill('0')
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill('2')
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await page.keyboard.press('Escape')
    await openPanel(page, 'moments')
    expect(await page.getByTestId(`moment-card-${second.id}`).getAttribute('data-moment-time')).toBe(timeBefore)
    const third = saved.zooms.find((z) => z.start > target.end + 1)!
    await openPanel(page, 'timeline')
    const ruler = page.getByTestId('timeline-ruler')
    const rb = await settledBox(page, ruler)
    await ruler.click({ position: { x: (third.start / 30) * rb.width, y: 5 } })
    await page.getByTestId('add-cut').click()
    await page.getByRole('textbox', { name: 'Start' }).fill(String(Math.max(0, third.start - 0.2)))
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill(String(Math.min(30, third.end + 0.2)))
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await page.keyboard.press('Escape')
    await openPanel(page, 'moments')
    await expect(page.getByTestId(`moment-card-${third.id}`)).toContainText('Removed by a cut')
    saved = (await savedProject(page, library)).json
    expect(saved.trims).toHaveLength(2)
    expect(saved.zooms.find((z) => z.id === third.id)).toBeTruthy()

    // A Timeline drag moves the same event the Moment card shows.
    await openPanel(page, 'timeline')
    const block = page.getByTestId(`zoom-${second.id}`)
    const bb = await settledBox(page, block)
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.mouse.down()
    await page.mouse.move(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2, { steps: 5 })
    await page.mouse.up()
    await openPanel(page, 'moments')
    const timeAfter = Number(await page.getByTestId(`moment-card-${second.id}`).getAttribute('data-moment-time'))
    expect(timeAfter).toBeGreaterThan(Number(timeBefore) + 0.3)
    const movedZoom = (await savedProject(page, library)).json.zooms.find((z) => z.id === second.id)!
    expect(movedZoom.start).toBeGreaterThan(target.start + 0.3)

    // Export: the edited Moment is visibly zoomed, the cut Moment's footage is gone.
    const out = join(dir, 'moments.mp4')
    await exportVia(page, app, out)
    const info = probe(out)
    expect(info.duration).toBeLessThan(30 - 2 - (third.end - third.start))
    expect(decodeErrors(out)).toBe('')
    expect(frameDiff(frameAt(out, 0.1, 480, 270), frameAt(out, 4, 480, 270))).toBeGreaterThan(1)
  } finally {
    await app.close()
  }
})

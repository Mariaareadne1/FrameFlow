// Product screenshots for visual QA and docs. Run explicitly:
//   FRAMEFLOW_SCREENSHOTS=1 npx playwright test 08            → tests/.artifacts/look
//   FRAMEFLOW_SCREENSHOTS=docs npx playwright test 08         → docs/media
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, ROOT, copyFixture, launch, stubOpenDialog, stubSaveDialog } from './helpers'

const OUT = process.env.FRAMEFLOW_SCREENSHOTS === 'docs' ? join(ROOT, 'docs/media') : join(ARTIFACTS, 'look')
mkdirSync(OUT, { recursive: true })
test.skip(!process.env.FRAMEFLOW_SCREENSHOTS, 'set FRAMEFLOW_SCREENSHOTS=1')

test('product screenshots', async () => {
  test.setTimeout(240_000)
  const { app, page, dir } = await launch({ synthetic: true })
  const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.png`) })
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await shot('01-home-empty')

    await page.getByTestId('record-demo').click()
    await page.getByTestId('sound-systemAudio').click()
    await page.getByTestId('sound-microphone').click()
    await page.waitForTimeout(400)
    await shot('02-record-setup')
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText(/\d:\d\d/)
    await page.waitForTimeout(1500)
    const hud = app.windows().find((w) => w.url().includes('#/hud'))
    if (hud) await hud.screenshot({ path: join(OUT, '03-recording-hud.png'), omitBackground: true })
    await shot('03-recording')
    await page.waitForTimeout(7000)
    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('studio')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    await shot('04-studio-moments')

    const firstCard = page.locator('[data-testid^="moment-card-"]').first()
    await firstCard.click()
    await page.waitForTimeout(700)
    await shot('05-moment-inspector')

    await page.getByTestId('dock-design').click()
    await page.waitForTimeout(900)
    await shot('06-design')
    await page.getByTestId('dock-camera').click()
    await page.waitForTimeout(500)
    await shot('07-camera')
    await page.getByTestId('dock-cursor').click()
    await page.waitForTimeout(500)
    await shot('08-cursor')
    await page.getByTestId('dock-sound').click()
    await page.waitForTimeout(900)
    await shot('17-sound')
    await page.getByTestId('dock-timeline').click()
    await page.waitForTimeout(700)
    await shot('09-timeline')

    await page.getByTestId('open-export').click()
    await page.waitForTimeout(600)
    await shot('10-export')
    await stubSaveDialog(app, join(dir, 'look.mp4'))
    await page.getByRole('radio', { name: '4K' }).click()
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-progress')).toBeVisible()
    await page.waitForTimeout(1200)
    await shot('11-export-progress')
    await page.getByTestId('export-done').waitFor({ timeout: 120_000 })
    await shot('12-export-done')
    await page.getByTestId('export-done').getByRole('button', { name: 'Done' }).click()

    // A second project (imported) so the gallery has variety.
    await page.getByTestId('go-home').click()
    const src = copyFixture(dir, 'demo-1920x1200.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await page.getByTestId('dock-design').click()
    await page.getByTestId('style-midnight').click()
    await page.waitForTimeout(1200)
    await page.getByTestId('go-home').click()
    await page.waitForTimeout(800)
    await shot('13-home-projects')

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.waitForTimeout(400)
    await shot('14-settings')
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 1100, height: 700 })
    await page.locator('[data-testid="project-card"] button').first().click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await page.waitForTimeout(1200)
    await shot('15-small-window')
    await page.getByTestId('dock-design').click()
    await page.waitForTimeout(800)
    await shot('16-small-window-design')
  } finally {
    await app.close()
  }
})

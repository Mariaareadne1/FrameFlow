// Captures product screenshots for docs/media (run explicitly: FRAMEFLOW_SCREENSHOTS=1).
import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { ROOT, copyFixture, launch, stubOpenDialog } from './helpers'

const OUT = join(ROOT, 'docs/media')
test.skip(process.env.FRAMEFLOW_SCREENSHOTS !== '1', 'set FRAMEFLOW_SCREENSHOTS=1')

test('product screenshots', async () => {
  const { app, page, dir } = await launch({ synthetic: true })
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByTestId('start-quick-demo').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'record-setup.png') })
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText('Recording')
    await page.waitForTimeout(1500)
    const hud = app.windows().find((w) => w.url().includes('#/hud'))
    if (hud) await hud.screenshot({ path: join(OUT, 'recording-hud.png'), omitBackground: true })
    await page.waitForTimeout(6000)
    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('quick-demo')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(OUT, 'quick-demo.png') })
    await page.getByTestId('open-export').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'export-dialog.png') })
    await page.keyboard.press('Escape')
    await page.getByTestId('open-advanced').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(OUT, 'advanced-editor.png') })
    await page.getByTestId('go-home').click()
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'settings.png') })
    await page.keyboard.press('Escape')
    const src = copyFixture(dir, 'demo-1920x1200.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await page.getByTestId('go-home').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(OUT, 'home.png') })
  } finally {
    await app.close()
  }
})

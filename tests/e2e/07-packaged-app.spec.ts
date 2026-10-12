// Smoke test of the packaged FrameFlow.app (run `npm run package` first).
import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, ROOT, exportVia, launch } from './helpers'
import { decodeErrors, probe } from '../support/media'

const EXE = join(ROOT, 'release/mac-arm64/FrameFlow.app/Contents/MacOS/FrameFlow')

test.skip(!existsSync(EXE), 'packaged app not built')

test('packaged app starts, records via its bundled helper and exports', async () => {
  const { app, page, dir } = await launch({ executablePath: EXE, synthetic: true })
  try {
    const info = await page.evaluate(() => window.frameflow.app.info())
    expect(info.version).toBe('2.0.0')
    await page.getByTestId('record-demo').click()
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText('Recording')
    await page.waitForTimeout(4000)
    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('studio')).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: join(ARTIFACTS, 'packaged-quick-demo.png') })
    const out = join(dir, 'packaged.mp4')
    await exportVia(page, app, out)
    expect(probe(out)).toMatchObject({ videoCodec: 'h264', width: 1920, height: 1080 })
    expect(decodeErrors(out)).toBe('')
    // Developer tools are not exposed in release builds.
    const hasToggleDevTools = await app.evaluate(({ Menu }) => {
      const walk = (items: Electron.MenuItem[]): boolean => items.some((i) => String(i.role ?? '').toLowerCase() === 'toggledevtools' || (i.submenu ? walk(i.submenu.items) : false))
      return walk(Menu.getApplicationMenu()?.items ?? [])
    })
    expect(hasToggleDevTools).toBe(false)
  } finally {
    await app.close()
  }
})

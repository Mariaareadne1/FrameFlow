import { expect, test } from '@playwright/test'
import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS, copyFixture, launch, savedProject, stubOpenDialog, stubSaveDialog } from './helpers'

test('permission denied shows guidance instead of recording', async () => {
  const { app, page } = await launch({ env: { FRAMEFLOW_FORCE_PERMISSION: 'denied' } })
  try {
    await page.getByTestId('start-quick-demo').click()
    await expect(page.getByTestId('permission-guidance')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open System Settings' })).toBeVisible()
    await expect(page.getByTestId('start-recording')).toHaveCount(0)
    await page.screenshot({ path: join(ARTIFACTS, 'permission-denied.png') })
    // Starting anyway via IPC is refused by the main process with a clear message.
    const err = await page.evaluate(() =>
      window.frameflow.capture.start({ source: { type: 'display', id: 1 }, microphone: false, countdown: 0 }).then(
        () => 'started',
        (e: Error) => e.message,
      ),
    )
    expect(err).toMatch(/Screen Recording permission/)
  } finally {
    await app.close()
  }
})

test('a project whose video moved can be relinked', async () => {
  const { app, page, dir, library } = await launch()
  try {
    const src = copyFixture(dir, 'short-1280x720.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('advanced-editor')).toBeVisible()
    await page.keyboard.press('z')
    const { json } = await savedProject(page, library)
    await page.getByTestId('go-home').click()

    const moved = join(dir, 'moved.mp4')
    renameSync(src, moved)
    await page.getByTestId('recent-projects').getByRole('button').first().click()
    await expect(page.getByTestId('missing-media')).toBeVisible()
    await page.screenshot({ path: join(ARTIFACTS, 'missing-media.png') })

    await stubOpenDialog(app, moved)
    await page.getByRole('button', { name: 'Locate Video…' }).click()
    await expect(page.getByTestId('preview-canvas')).toBeVisible()
    const after = (await savedProject(page, library)).json
    expect(after.media.path).toBe(moved)
    expect(after.zooms).toEqual(json.zooms)
  } finally {
    await app.close()
  }
})

test('cancelling an export leaves no file behind and keeps the project intact', async () => {
  const { app, page, dir, library } = await launch()
  try {
    const src = copyFixture(dir, 'demo-1920x1200.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('advanced-editor')).toBeVisible()
    const before = (await savedProject(page, library)).json
    const out = join(dir, 'cancelled.mp4')
    await stubSaveDialog(app, out)
    await page.getByTestId('open-export').click()
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-progress')).toBeVisible()
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('export-start')).toBeVisible()
    await page.waitForTimeout(500)
    expect(existsSync(out)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.includes('.partial'))).toEqual([])
    expect((await savedProject(page, library)).json.zooms).toEqual(before.zooms)
  } finally {
    await app.close()
  }
})

test('an export to an unwritable location fails with a clear message', async () => {
  const { app, page, dir } = await launch()
  try {
    const src = copyFixture(dir, 'short-1280x720.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('advanced-editor')).toBeVisible()
    await stubSaveDialog(app, join(dir, 'no-such-folder', 'out.mp4'))
    await page.getByTestId('open-export').click()
    await page.getByTestId('export-start').click()
    await expect(page.getByTestId('export-error')).toBeVisible()
    await expect(page.getByTestId('export-error')).toContainText(/no such file|ENOENT/i)
  } finally {
    await app.close()
  }
})

test('discarding a recording deletes it and returns to setup', async () => {
  const { app, page, library } = await launch({ synthetic: true })
  try {
    await page.getByTestId('start-quick-demo').click()
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toContainText('Recording')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByTestId('start-recording')).toBeVisible()
    await page.waitForTimeout(500)
    const left = existsSync(library) ? readdirSync(library) : []
    expect(left).toEqual([])
  } finally {
    await app.close()
  }
})

test('quitting during a recording still leaves a playable file', async () => {
  const { app, page, library } = await launch({ synthetic: true })
  await page.getByTestId('start-quick-demo').click()
  await page.getByTestId('start-recording').click()
  await expect(page.getByTestId('recording-status')).toContainText('Recording')
  await page.waitForTimeout(2500)
  await app.close()
  const folders = readdirSync(library)
  expect(folders).toHaveLength(1)
  const video = join(library, folders[0]!, 'recording.mp4')
  expect(existsSync(video)).toBe(true)
  const { probe, decodeErrors } = await import('../support/media')
  const info = probe(video)
  expect(info.videoCodec).toBe('h264')
  expect(info.duration).toBeGreaterThan(1.5)
  expect(decodeErrors(video)).toBe('')
  expect(existsSync(join(library, folders[0]!, 'cursor.json'))).toBe(true)
})

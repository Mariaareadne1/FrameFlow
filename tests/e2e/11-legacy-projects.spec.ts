import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURES, ROOT, exportVia, launch, savedProject, stubOpenDialog } from './helpers'
import { FFMPEG, decodeErrors, frameAt, frameDiff, probe } from '../support/media'

const GOLDEN = join(ROOT, 'tests/fixtures/legacy/golden')
const TIMES = [0.5, 3.5, 6.2, 10.4, 15, 21.7]

function goldenFrame(name: string, t: number, w: number, h: number) {
  const data = execFileSync(FFMPEG, ['-v', 'error', '-i', join(GOLDEN, `${name}-${t}.png`), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return { width: w, height: h, data }
}

for (const name of ['v1-recording', 'v1-dynamic', 'v1-import'] as const) {
  test(`legacy 0.1 project ${name} opens, renders identically, and migrates safely`, async () => {
    test.setTimeout(300_000)
    const { app, page, dir, library } = await launch()
    try {
      const folder = join(library, name)
      mkdirSync(folder, { recursive: true })
      const file = join(folder, `${name}.frameflow`)
      const original = readFileSync(join(ROOT, 'tests/fixtures/legacy', `${name}.frameflow`), 'utf8').replaceAll('{{FIXTURES}}', FIXTURES)
      writeFileSync(file, original)
      const raw = JSON.parse(original)

      await stubOpenDialog(app, file)
      await page.getByTestId('open-project-file').click()
      await expect(page.getByTestId('studio')).toBeVisible()
      // Legacy "advanced" projects reopen in the Timeline; others in Moments.
      await expect(page.getByTestId('studio')).toHaveAttribute('data-section', raw.mode === 'advanced' ? 'timeline' : 'moments')
      // Opening alone never rewrites the file.
      expect(readFileSync(file, 'utf8')).toBe(original)

      // Export with untouched settings and compare with frames exported by FrameFlow 0.1.
      const out = join(dir, `${name}.mp4`)
      await exportVia(page, app, out)
      const info = probe(out)
      expect(decodeErrors(out)).toBe('')
      const portrait = name === 'v1-dynamic'
      const [w, h] = portrait ? [270, 480] : [480, 270]
      expect([info.width, info.height]).toEqual(portrait ? [1080, 1920] : [1920, 1080])
      for (const t of TIMES) {
        const diff = frameDiff(frameAt(out, t, w, h), goldenFrame(name, t, w, h))
        console.log(`[legacy] ${name} t=${t}s diff vs 0.1: ${diff.toFixed(2)}`)
        expect(diff).toBeLessThan(2.5)
      }

      // Make an edit: the project is saved as v2, a backup of the 0.1 file is kept.
      await page.getByTestId('project-name').fill(`${raw.name} (2.0)`)
      await page.getByTestId('project-name').press('Enter')
      const saved = (await savedProject(page, library)).json
      expect(saved.version).toBe(3)
      expect(saved.zooms).toEqual(raw.zooms)
      expect(saved.trims).toEqual(raw.trims)
      expect(saved.frame).toEqual(raw.frame)
      expect(saved.background).toEqual(raw.background)
      expect(saved.style).toBe(raw.style)
      expect(saved.cursor).toMatchObject({ size: raw.cursor.size, smoothing: raw.cursor.smoothing, clickEffect: raw.cursor.clickEffect })
      expect(existsSync(`${file}.v1.bak`)).toBe(true)
      expect(readFileSync(`${file}.v1.bak`, 'utf8')).toBe(original)

      // Reopen the migrated file: still valid and unchanged.
      await page.getByTestId('go-home').click()
      await page.locator('[data-testid="project-card"] button').first().click()
      await expect(page.getByTestId('studio')).toBeVisible()
      const reopened = (await savedProject(page, library)).json
      expect(reopened.zooms).toEqual(raw.zooms)
      expect(reopened.name).toBe(`${raw.name} (2.0)`)
    } finally {
      await app.close()
    }
  })
}

// One-time capture of golden frames from the FrameFlow 0.1 renderer (run against the v0.1 build).
// Kept for reference/reproducibility: `git checkout 8fc477b && npm run build && npx playwright test tests/legacy-golden`.
import { test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURES, ROOT, launch, stubOpenDialog, stubSaveDialog } from '../e2e/helpers'
import { FFMPEG } from '../support/media'

export const GOLDEN = join(ROOT, 'tests/fixtures/legacy/golden')
export const GOLDEN_TIMES = [0.5, 3.5, 6.2, 10.4, 15, 21.7]

test.skip(process.env.FRAMEFLOW_CAPTURE_GOLDEN !== '1', 'set FRAMEFLOW_CAPTURE_GOLDEN=1 with a v0.1 build')

for (const name of ['v1-recording', 'v1-dynamic', 'v1-import']) {
  test(`golden ${name}`, async () => {
    const { app, page, dir, library } = await launch()
    try {
      const folder = join(library, name)
      mkdirSync(folder, { recursive: true })
      const file = join(folder, `${name}.frameflow`)
      writeFileSync(file, readFileSync(join(ROOT, 'tests/fixtures/legacy', `${name}.frameflow`), 'utf8').replaceAll('{{FIXTURES}}', FIXTURES))
      await stubOpenDialog(app, file)
      await page.getByRole('button', { name: 'Open Project…' }).click()
      await page.getByTestId('open-export').waitFor()
      const out = join(dir, `${name}.mp4`)
      await stubSaveDialog(app, out)
      await page.getByTestId('open-export').click()
      await page.getByTestId('export-start').click()
      await page.getByTestId('export-done').waitFor({ timeout: 170_000 })
      const portrait = name === 'v1-dynamic'
      for (const t of GOLDEN_TIMES) {
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', portrait ? 'scale=270:480:flags=area' : 'scale=480:270:flags=area', join(GOLDEN, `${name}-${t}.png`)])
      }
    } finally {
      await app.close()
    }
  })
}

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ROOT = join(import.meta.dirname, '../..')
export const FIXTURES = join(ROOT, 'test-fixtures')
export const ARTIFACTS = join(ROOT, 'tests/.artifacts')
mkdirSync(ARTIFACTS, { recursive: true })

export interface Launched {
  app: ElectronApplication
  page: Page
  dir: string
  library: string
}

export async function launch(opts: { synthetic?: boolean; env?: Record<string, string>; dir?: string } = {}): Promise<Launched> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'frameflow-e2e-'))
  const library = join(dir, 'library')
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FRAMEFLOW_TEST: '1',
    FRAMEFLOW_USER_DATA: join(dir, 'userData'),
    FRAMEFLOW_LIBRARY: library,
    ...(opts.synthetic ? { FRAMEFLOW_CAPTURE_SYNTHETIC: '1' } : {}),
    ...opts.env,
  }
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [join(ROOT, 'out/main/index.js')], env, cwd: ROOT })
  const page = await app.firstWindow()
  page.on('pageerror', (err) => console.error('[renderer error]', err))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[renderer console]', msg.text())
  })
  await page.waitForLoadState('domcontentloaded')
  // No countdown in tests; keep other defaults.
  await page.evaluate(() => localStorage.setItem('frameflow.prefs.v1', JSON.stringify({ style: 'clean', autoZoom: 'subtle', countdown: 0, microphone: false })))
  await page.reload()
  return { app, page, dir, library }
}

/** Makes the next save dialog return `path` without showing UI. */
export async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog
  }, path)
}

export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog
  }, path)
}

/** Copies a fixture into the test's temp dir so tests can move/delete it freely. */
export function copyFixture(dir: string, name: string): string {
  const dest = join(dir, name)
  cpSync(join(FIXTURES, name), dest)
  return dest
}

export async function exportVia(page: Page, app: ElectronApplication, dest: string): Promise<void> {
  await stubSaveDialog(app, dest)
  await page.getByTestId('open-export').click()
  await page.getByTestId('export-start').click()
  await page.getByTestId('export-done').waitFor({ timeout: 170_000 })
  await page.getByRole('button', { name: 'Done' }).click()
}

/** Waits for autosave, then returns the project JSON on disk. */
export async function savedProject(page: Page, library: string): Promise<{ path: string; json: SavedProject }> {
  await page.getByTestId('save-state').filter({ hasText: /^Saved$/ }).waitFor()
  const files = findProjects(library)
  if (files.length === 0) throw new Error('no project file found')
  const newest = files.map((f) => ({ f, m: statSync(f).mtimeMs })).sort((a, b) => b.m - a.m)[0]!.f
  return { path: newest, json: JSON.parse(readFileSync(newest, 'utf8')) }
}

export function findProjects(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.frameflow')) out.push(p)
    }
  }
  walk(dir)
  return out
}

/** Loosely typed view of a project file, for assertions. */
export type SavedProject = import('../../src/shared/project').Project

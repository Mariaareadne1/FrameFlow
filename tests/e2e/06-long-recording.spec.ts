import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createProject } from '../../src/shared/projectModel'
import { parseCursorTrack } from '../../src/shared/engine/cursor'
import { ARTIFACTS, FIXTURES, exportVia, launch, stubOpenDialog } from './helpers'
import { decodeErrors, probe } from '../support/media'

function rssMb(pid: number): number {
  return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024
}

test('5-minute recording: opens quickly, edits stay responsive, export streams with bounded memory', async () => {
  test.setTimeout(900_000)
  const { app, page, dir } = await launch()
  try {
    // A project as the recorder would create it, pointing at the long fixture + its cursor data.
    const video = join(FIXTURES, 'long-1920x1200.mp4')
    const cursorPath = join(FIXTURES, 'long-1920x1200.cursor.json')
    const track = parseCursorTrack(JSON.parse(readFileSync(cursorPath, 'utf8')))
    const project = createProject({
      name: 'Long demo',
      media: { path: video, width: 1920, height: 1200, duration: 300, hasAudio: true, cursorPath, cursorEmbedded: false },
      cursorTrack: track,
    })
    const projDir = join(dir, 'library', 'long')
    mkdirSync(projDir, { recursive: true })
    const projPath = join(projDir, 'Long demo.frameflow')
    writeFileSync(projPath, JSON.stringify(project))
    expect(project.zooms.length).toBeGreaterThan(10)

    await stubOpenDialog(app, projPath)
    const t0 = Date.now()
    await page.getByTestId('open-project-file').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    await page.getByTestId('play-toggle').waitFor()
    const openMs = Date.now() - t0

    await page.getByTestId('dock-design').click()
    await page.getByTestId('style-midnight').waitFor()
    // Responsiveness: time 20 style edits (each rebuilds the scene and redraws the preview).
    const editMs = await page.evaluate(async () => {
      const start = performance.now()
      for (let i = 0; i < 20; i++) {
        const btn = document.querySelector(i % 2 ? '[data-testid="style-midnight"]' : '[data-testid="style-editorial"]') as HTMLButtonElement
        btn.click()
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      return (performance.now() - start) / 20
    })

    const rendererPid = await app.evaluate(({ webContents }) => webContents.getAllWebContents()[0]!.getOSProcessId())
    const mainPid = app.process().pid!
    const samples: number[] = []
    const timer = setInterval(() => {
      try {
        samples.push(rssMb(rendererPid) + rssMb(mainPid))
      } catch {
        /* process may be busy */
      }
    }, 1000)
    const out = join(dir, 'long.mp4')
    const e0 = Date.now()
    await exportVia(page, app, out)
    const exportS = (Date.now() - e0) / 1000
    clearInterval(timer)

    const info = probe(out)
    expect(info.frames).toBe(18000)
    expect(info.audioCodec).toBe('aac')
    expect(Math.abs(info.duration - 300)).toBeLessThan(0.1)
    expect(decodeErrors(out)).toBe('')
    const peak = Math.max(...samples)
    const report = { openMs, editMsPerChange: Number(editMs.toFixed(1)), exportSeconds: exportS, realtimeFactor: Number((300 / exportS).toFixed(2)), peakRssMb: Math.round(peak), sizeMb: Math.round(Number(execFileSync('stat', ['-f', '%z', out], { encoding: 'utf8' })) / 1e6) }
    console.log('[perf]', JSON.stringify(report))
    writeFileSync(join(ARTIFACTS, 'perf-long-recording.json'), JSON.stringify(report, null, 2))
    expect(openMs).toBeLessThan(5000)
    expect(editMs).toBeLessThan(100)
    // Memory must not scale with video length (a 5 min 1080p60 raw video would be ~110 GB).
    expect(peak).toBeLessThan(2500)
  } finally {
    await app.close()
  }
})

test('a gallery of 60 recent projects renders quickly and stays responsive', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'frameflow-gallery-'))
  const library = join(dir, 'library')
  const userData = join(dir, 'userData')
  mkdirSync(userData, { recursive: true })
  // A real thumbnail (a frame of the fixture) shared by every card.
  const thumb = `data:image/jpeg;base64,${execFileSync(join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'), ['-v', 'error', '-ss', '3', '-i', join(FIXTURES, 'demo-1920x1200.mp4'), '-frames:v', '1', '-vf', 'scale=384:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']).toString('base64')}`
  const recents = []
  for (let i = 0; i < 60; i++) {
    const folder = join(library, `Project ${i}`)
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `Project ${i}.frameflow`)
    const p = createProject({ name: `Project ${String(i).padStart(2, '0')}`, media: { path: join(FIXTURES, 'demo-1920x1200.mp4'), width: 1920, height: 1200, duration: 30, hasAudio: false, cursorPath: null, cursorEmbedded: true }, cursorTrack: null, aspectRatio: i % 3 === 0 ? '9:16' : '16:9' })
    writeFileSync(file, JSON.stringify(p))
    recents.push({ path: file, name: p.name, updatedAt: p.updatedAt, duration: 30, thumbnail: thumb, aspectRatio: p.aspectRatio, mediaPath: p.media.path })
  }
  writeFileSync(join(userData, 'recent-projects.json'), JSON.stringify(recents))
  const t0 = Date.now()
  const { app, page } = await launch({ dir })
  try {
    await expect(page.getByTestId('project-card')).toHaveCount(60)
    const ms = Date.now() - t0
    const scrollMs = await page.evaluate(async () => {
      const main = document.querySelector('main')!
      const start = performance.now()
      for (let y = 0; y < 4000; y += 200) {
        main.scrollTop = y
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      return (performance.now() - start) / 20
    })
    console.log('[perf] gallery', JSON.stringify({ launchToGalleryMs: ms, msPerScrollFrame: Number(scrollMs.toFixed(1)) }))
    expect(ms).toBeLessThan(15_000)
    expect(scrollMs).toBeLessThan(50)
  } finally {
    await app.close()
  }
})

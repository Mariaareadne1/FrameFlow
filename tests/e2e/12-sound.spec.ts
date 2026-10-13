import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { ARTIFACTS, FIXTURES, exportVia, launch, openPanel, savedProject, stubOpenDialog } from './helpers'
import { bandLevel, decodeErrors, probe } from '../support/media'

/**
 * The synthetic capture source emits a 440 Hz "system audio" tone into the recording and a
 * 660 Hz "microphone" tone into microphone.m4a, so every source in the mix is identifiable.
 */
const PRESENT = -32 // dB in a narrow band: clearly audible
/** A muted source must sit this far below an audible one (band filters leak ~25 dB). */
const MUTED_GAP = 20

test('sound: system audio + microphone recording, levels, imported track, cuts, reopen', async () => {
  test.setTimeout(420_000)
  const { app, page, dir, library } = await launch({ synthetic: true })
  try {
    await page.getByTestId('record-demo').click()
    await page.getByTestId('sound-systemAudio').click()
    await page.getByTestId('sound-microphone').click()
    await expect(page.getByTestId('sound-systemAudio')).toHaveAttribute('aria-checked', 'true')
    await page.screenshot({ path: join(ARTIFACTS, 'record-setup-sound.png') })
    await page.getByTestId('start-recording').click()
    await expect(page.getByTestId('recording-status')).toBeVisible()
    await page.waitForTimeout(6000)
    await page.getByTestId('stop-recording').click()
    await expect(page.getByTestId('studio')).toBeVisible({ timeout: 30_000 })

    // The recording carries system audio; the microphone is a separate, mixable track.
    let p = (await savedProject(page, library)).json
    expect(p.media.hasAudio).toBe(true)
    expect(p.sound.mainGain).toBe(1)
    expect(p.sound.tracks).toHaveLength(1)
    expect(p.sound.tracks[0]).toMatchObject({ kind: 'microphone', label: 'Microphone', gain: 1 })
    expect(p.sound.tracks[0]!.path).toMatch(/microphone\.m4a$/)
    await openPanel(page, 'sound')
    await expect(page.getByTestId('sound-track-microphone')).toBeVisible()
    await page.screenshot({ path: join(ARTIFACTS, 'sound-panel.png') })

    // 1. Default mix: both sources present.
    const both = join(dir, 'both.mp4')
    await exportVia(page, app, both)
    expect(probe(both).audioCodec).toBe('aac')
    expect(decodeErrors(both)).toBe('')
    expect(bandLevel(both, 440)).toBeGreaterThan(PRESENT)
    expect(bandLevel(both, 660)).toBeGreaterThan(PRESENT)

    // 2. Microphone muted: only system audio remains.
    await page.getByTestId('sound-track-microphone').getByRole('slider', { name: 'Level' }).fill('0')
    const sysOnly = join(dir, 'system-only.mp4')
    await exportVia(page, app, sysOnly)
    const sys440 = bandLevel(sysOnly, 440)
    expect(sys440).toBeGreaterThan(PRESENT)
    expect(bandLevel(sysOnly, 660)).toBeLessThan(sys440 - MUTED_GAP)
    expect(bandLevel(sysOnly, 660)).toBeLessThan(bandLevel(both, 660) - MUTED_GAP)

    // 3. System audio muted, microphone back: only the voice remains.
    await page.getByTestId('sound-track-microphone').getByRole('slider', { name: 'Level' }).fill('1')
    await page.getByTestId('sound-panel').getByRole('slider', { name: 'System audio' }).fill('0')
    const micOnly = join(dir, 'mic-only.mp4')
    await exportVia(page, app, micOnly)
    const mic660 = bandLevel(micOnly, 660)
    expect(mic660).toBeGreaterThan(PRESENT)
    expect(bandLevel(micOnly, 440)).toBeLessThan(mic660 - MUTED_GAP)
    expect(bandLevel(micOnly, 440)).toBeLessThan(bandLevel(both, 440) - MUTED_GAP)
    await page.getByTestId('sound-panel').getByRole('slider', { name: 'System audio' }).fill('1')

    // 4. Import a voice-over track (880 Hz) and cut a section: everything stays aligned.
    await stubOpenDialog(app, join(FIXTURES, 'tone-880.m4a'))
    await page.getByTestId('add-audio').click()
    await expect(page.getByTestId('sound-track-imported')).toBeVisible()
    await openPanel(page, 'timeline')
    await page.getByTestId('add-cut').click()
    await page.getByRole('textbox', { name: 'Start' }).fill('1')
    await page.getByRole('textbox', { name: 'Start' }).press('Enter')
    await page.getByRole('textbox', { name: 'End' }).fill('2')
    await page.getByRole('textbox', { name: 'End' }).press('Enter')
    await page.keyboard.press('Escape')
    p = (await savedProject(page, library)).json
    expect(p.sound.tracks.map((t) => t.kind)).toEqual(['microphone', 'imported'])
    const mixed = join(dir, 'mixed-cut.mp4')
    await exportVia(page, app, mixed)
    const info = probe(mixed)
    expect(info.duration).toBeGreaterThan(p.media.duration - 1 - 0.15)
    expect(info.duration).toBeLessThan(p.media.duration - 1 + 0.15)
    for (const f of [440, 660, 880]) expect(bandLevel(mixed, f), `${f} Hz`).toBeGreaterThan(PRESENT)
    expect(decodeErrors(mixed)).toBe('')

    // 5. Save, go home, reopen: the mix is intact.
    await page.getByTestId('go-home').click()
    await page.locator('[data-testid="project-card"] button').first().click()
    await expect(page.getByTestId('studio')).toBeVisible()
    const reopened = (await savedProject(page, library)).json
    expect(reopened.sound).toEqual(p.sound)
  } finally {
    await app.close()
  }
})

test('sound: a silent recording can get a voice-over; old projects keep their audio untouched', async () => {
  test.setTimeout(240_000)
  const { app, page, dir, library } = await launch()
  try {
    // tone-1280x800 has its own 440 Hz track; at 100% with no extras it is passed through exactly.
    const { copyFixture } = await import('./helpers')
    const src = copyFixture(dir, 'tone-1280x800.mp4')
    await stubOpenDialog(app, src)
    await page.getByTestId('import-video').click()
    await expect(page.getByTestId('studio')).toBeVisible()
    const passthrough = join(dir, 'passthrough.mp4')
    await exportVia(page, app, passthrough)
    expect(bandLevel(passthrough, 440)).toBeGreaterThan(PRESENT)

    // A silent video gains audio only through an added track.
    await page.getByTestId('go-home').click()
    const silent = copyFixture(dir, 'short-1280x720.mp4')
    await stubOpenDialog(app, silent)
    await page.getByTestId('import-video').click()
    await openPanel(page, 'sound')
    await expect(page.getByTestId('sound-panel')).toContainText('recorded without sound')
    await stubOpenDialog(app, join(FIXTURES, 'tone-880.m4a'))
    await page.getByTestId('add-audio').click()
    await expect(page.getByTestId('sound-track-imported')).toBeVisible()
    const vo = join(dir, 'voiceover.mp4')
    await exportVia(page, app, vo)
    const info = probe(vo)
    expect(info.audioCodec).toBe('aac')
    expect(info.duration).toBeLessThan(1.7) // the 12 s track is cut to the 1.5 s video
    expect(bandLevel(vo, 880)).toBeGreaterThan(PRESENT)
    expect((await savedProject(page, library)).json.sound.tracks).toHaveLength(1)
  } finally {
    await app.close()
  }
})

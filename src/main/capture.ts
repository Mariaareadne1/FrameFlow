import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { app, BrowserWindow, desktopCapturer, globalShortcut, shell, systemPreferences } from 'electron'
import { IPC, type CaptureEvent, type CaptureSource, type PermissionState, type RecordingResult, type StartRecordingOptions } from '@shared/ipc'
import { allowRead } from './access'
import { libraryPath, timestampLabel } from './library'
import { registerOwnedFolder } from './projects'
import { createHudWindow } from './windows'

const STOP_SHORTCUT = 'CommandOrControl+Shift+2'
const STOP_TIMEOUT_MS = 15_000

function helperPath(): string {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'bin', 'FrameFlowCapture')]
    : [join(__dirname, '../../resources/bin/FrameFlowCapture'), join(app.getAppPath(), 'resources/bin/FrameFlowCapture')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

function synthetic(): boolean {
  return process.env.FRAMEFLOW_CAPTURE_SYNTHETIC === '1'
}

export function screenPermission(): PermissionState {
  if (process.platform !== 'darwin') return 'unsupported'
  // Test hook: lets E2E tests exercise the permission-denied UI without changing OS settings.
  const forced = process.env.FRAMEFLOW_TEST === '1' ? process.env.FRAMEFLOW_FORCE_PERMISSION : undefined
  if (forced) return forced as PermissionState
  if (synthetic()) return 'granted'
  return systemPreferences.getMediaAccessStatus('screen') as PermissionState
}

export async function openPermissionSettings(): Promise<void> {
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
}

export async function listSources(ownWindows: BrowserWindow[]): Promise<CaptureSource[]> {
  if (synthetic()) {
    return [{ type: 'display', id: 1, name: 'Synthetic Test Display', thumbnail: null, width: 1920, height: 1200 }]
  }
  const own = new Set(ownWindows.filter((w) => !w.isDestroyed()).map((w) => w.getMediaSourceId()))
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 300 } })
  const result: CaptureSource[] = []
  let displayIndex = 1
  for (const s of sources) {
    if (own.has(s.id)) continue
    const thumbnail = s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL()
    if (s.id.startsWith('screen:')) {
      const id = Number(s.display_id)
      if (!Number.isFinite(id) || id <= 0) continue
      result.push({ type: 'display', id, name: sources.filter((x) => x.id.startsWith('screen:')).length > 1 ? `Display ${displayIndex++}` : 'Entire Screen', thumbnail })
    } else if (s.id.startsWith('window:')) {
      const id = Number(s.id.split(':')[1])
      if (!Number.isFinite(id) || id <= 0 || !s.name.trim()) continue
      result.push({ type: 'window', id, name: s.name, thumbnail })
    }
  }
  return result
}

interface ActiveRecording {
  child: ChildProcessWithoutNullStreams
  folder: string
  microphone: boolean
  cancelled: boolean
  stopTimer?: NodeJS.Timeout
}

export class CaptureController {
  private active: ActiveRecording | null = null
  private hud: BrowserWindow | null = null
  private countdownTimer: NodeJS.Timeout | null = null
  private pendingCountdown: (() => void) | null = null

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  get isRecording(): boolean {
    return this.active !== null
  }

  private broadcast(event: CaptureEvent): void {
    for (const win of [this.getMainWindow(), this.hud]) {
      if (win && !win.isDestroyed()) win.webContents.send(IPC.captureEvent, event)
    }
  }

  private showHud(): void {
    if (!this.hud || this.hud.isDestroyed()) {
      this.hud = createHudWindow()
      this.hud.on('closed', () => (this.hud = null))
    }
  }

  private restoreMain(): void {
    if (this.hud && !this.hud.isDestroyed()) this.hud.close()
    this.hud = null
    globalShortcut.unregister(STOP_SHORTCUT)
    const main = this.getMainWindow()
    if (main && !main.isDestroyed()) {
      main.show()
      main.focus()
    }
  }

  async start(options: StartRecordingOptions): Promise<void> {
    if (this.active || this.countdownTimer) throw new Error('A recording is already in progress.')
    if (process.platform !== 'darwin') throw new Error('Screen recording currently requires macOS.')
    const permission = screenPermission()
    if (permission === 'denied' || permission === 'restricted') {
      throw new Error('FrameFlow does not have Screen Recording permission. Enable it in System Settings › Privacy & Security › Screen Recording, then reopen FrameFlow.')
    }
    const helper = helperPath()
    if (!existsSync(helper)) throw new Error('The capture helper is missing. Run "npm run build:native" and try again.')

    let microphone = options.microphone
    if (microphone && !synthetic()) {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      microphone = status === 'granted' || (status === 'not-determined' && (await systemPreferences.askForMediaAccess('microphone')))
    }

    const folder = join(libraryPath(), `Recording ${timestampLabel()}`)
    await fs.mkdir(folder, { recursive: true })
    registerOwnedFolder(folder)

    const main = this.getMainWindow()
    this.showHud()
    globalShortcut.register(STOP_SHORTCUT, () => void this.stop())
    if (main && !main.isDestroyed() && process.env.FRAMEFLOW_TEST !== '1') main.hide()

    const countdown = Math.max(0, Math.min(10, Math.round(options.countdown)))
    const proceed = await this.runCountdown(countdown)
    if (!proceed) {
      await fs.rm(folder, { recursive: true, force: true })
      this.restoreMain()
      this.broadcast({ type: 'cancelled' })
      return
    }

    const args = ['record', '--out-dir', folder, '--fps', '60', '--exclude-pid', String(process.pid)]
    if (options.source.type === 'window') args.push('--window', String(options.source.id))
    else args.push('--display', String(options.source.id))
    if (microphone) args.push('--mic')
    if (options.systemAudio) args.push('--system-audio')

    // The helper gets a minimal environment, not the app's.
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }
    if (synthetic()) env.FRAMEFLOW_CAPTURE_SYNTHETIC = '1'
    const child = spawn(helper, args, { stdio: ['pipe', 'pipe', 'pipe'], env })
    const rec: ActiveRecording = { child, folder, microphone, cancelled: false }
    this.active = rec
    this.wire(rec)
  }

  /** Resolves true when the countdown completes, false if it was cancelled. */
  private runCountdown(seconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      let remaining = seconds
      const finish = (ok: boolean) => {
        if (this.countdownTimer) clearInterval(this.countdownTimer)
        this.countdownTimer = null
        this.pendingCountdown = null
        resolve(ok)
      }
      if (remaining <= 0) return finish(true)
      this.broadcast({ type: 'countdown', remaining })
      this.pendingCountdown = () => finish(false)
      this.countdownTimer = setInterval(() => {
        remaining -= 1
        if (remaining <= 0) finish(true)
        else this.broadcast({ type: 'countdown', remaining })
      }, 1000)
    })
  }

  private wire(rec: ActiveRecording): void {
    let stderr = ''
    let settled = false
    rec.child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)))
    const lines = createInterface({ input: rec.child.stdout })
    lines.on('line', (line) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }
      switch (msg.event) {
        case 'started':
          this.broadcast({ type: 'started', width: Number(msg.width), height: Number(msg.height) })
          break
        case 'progress':
          this.broadcast({ type: 'progress', seconds: Number(msg.seconds) })
          break
        case 'stopped': {
          settled = true
          void this.complete(rec, msg)
          break
        }
        case 'error': {
          settled = true
          const code = String(msg.code ?? 'capture-failed')
          const message = code === 'permission-denied'
            ? 'Screen Recording permission was denied. Enable FrameFlow in System Settings › Privacy & Security › Screen Recording.'
            : String(msg.message ?? 'Recording failed.')
          void this.fail(rec, code, message)
          break
        }
      }
    })
    rec.child.on('exit', (code) => {
      if (settled) return
      void this.fail(rec, 'helper-exited', `The capture helper stopped unexpectedly (exit ${code}). ${stderr.trim().split('\n').slice(-1)[0] ?? ''}`.trim())
    })
    rec.child.on('error', (err) => {
      if (settled) return
      settled = true
      void this.fail(rec, 'helper-failed', `Could not start the capture helper: ${err.message}`)
    })
  }

  private async complete(rec: ActiveRecording, msg: Record<string, unknown>): Promise<void> {
    if (rec.stopTimer) clearTimeout(rec.stopTimer)
    this.active = null
    if (rec.cancelled) {
      await fs.rm(rec.folder, { recursive: true, force: true })
      this.restoreMain()
      this.broadcast({ type: 'cancelled' })
      return
    }
    const videoPath = String(msg.video)
    const cursorPath = typeof msg.cursor === 'string' && existsSync(msg.cursor) ? msg.cursor : null
    const microphonePath = typeof msg.microphone === 'string' && existsSync(msg.microphone) ? msg.microphone : null
    allowRead(videoPath)
    if (cursorPath) allowRead(cursorPath)
    if (microphonePath) allowRead(microphonePath)
    const result: RecordingResult = {
      folder: rec.folder,
      videoPath,
      cursorPath,
      duration: Number(msg.duration),
      width: Number(msg.width),
      height: Number(msg.height),
      hasAudio: rec.microphone || msg.systemAudio === true,
      hasSystemAudio: msg.systemAudio === true,
      microphonePath,
    }
    this.restoreMain()
    this.broadcast({ type: 'stopped', result })
  }

  private async fail(rec: ActiveRecording, code: string, message: string): Promise<void> {
    if (rec.stopTimer) clearTimeout(rec.stopTimer)
    if (this.active === rec) this.active = null
    this.restoreMain()
    this.broadcast({ type: 'error', code, message })
  }

  async stop(): Promise<void> {
    if (this.pendingCountdown) {
      this.pendingCountdown()
      return
    }
    const rec = this.active
    if (!rec) return
    this.broadcast({ type: 'stopping' })
    if (rec.child.stdin.writable) rec.child.stdin.write('stop\n')
    rec.stopTimer ??= setTimeout(() => rec.child.kill('SIGTERM'), STOP_TIMEOUT_MS)
  }

  async cancel(): Promise<void> {
    if (this.active) this.active.cancelled = true
    await this.stop()
  }

  /** Called on quit: ask the helper to finalize the file, waiting briefly. */
  async shutdown(): Promise<void> {
    const rec = this.active
    if (!rec) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 6000)
      rec.child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      void this.stop()
    })
  }
}

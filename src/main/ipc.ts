import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type StartRecordingOptions } from '@shared/ipc'
import type { Project } from '@shared/project'
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, allowExport, allowRead, canonical, isReadable } from './access'
import { CaptureController, listSources, openPermissionSettings, screenPermission } from './capture'
import { abortExport, beginExport, closeReader, finishExport, openReader, readRange, writeExport } from './fileHandles'
import { isTestMode, libraryPath, safeName } from './library'
import { isAppUrl } from './windows'
import { chooseAndOpenProject, createProjectPath, forgetRecent, listRecents, openProject, readCursorFile, renameRecent, revealRecent, saveProject, saveProjectAs } from './projects'

const exported = new Set<string>()

function windowOf(e: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Invalid ${name}.`)
  return v
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 4096) throw new Error(`Invalid ${name}.`)
  return v
}

function parseStartOptions(v: unknown): StartRecordingOptions {
  const o = (v ?? {}) as Partial<StartRecordingOptions>
  const type = o.source?.type
  if (type !== 'display' && type !== 'window') throw new Error('Invalid capture source.')
  return {
    source: { type, id: num(o.source?.id, 'source id') },
    microphone: o.microphone === true,
    systemAudio: o.systemAudio === true,
    countdown: typeof o.countdown === 'number' && Number.isFinite(o.countdown) ? Math.max(0, Math.min(10, Math.round(o.countdown))) : 3,
  }
}

/** Only our own top-level app pages may call into the main process. */
function trustedSender(e: IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame
  return !!frame && !frame.parent && isAppUrl(frame.url)
}

export function registerIpc(capture: CaptureController, getWindows: () => BrowserWindow[]): void {
  const original = ipcMain.handle.bind(ipcMain)
  const handle: typeof ipcMain.handle = (channel, listener) =>
    original(channel, (e, ...args) => {
      if (!trustedSender(e)) throw new Error('Untrusted sender.')
      return listener(e, ...args)
    })
  const ipc = { handle }

  ipc.handle(IPC.appInfo, (): AppInfo => ({ version: __FRAMEFLOW_VERSION__, platform: process.platform, isTest: isTestMode(), libraryPath: libraryPath() }))
  ipc.handle(IPC.reveal, (_e, p: unknown) => {
    const path = canonical(str(p, 'path'))
    if (!isReadable(path) && !exported.has(path) && path !== canonical(libraryPath())) throw new Error('Not allowed.')
    shell.showItemInFolder(path)
  })

  ipc.handle(IPC.capturePermission, () => screenPermission())
  ipc.handle(IPC.captureOpenSettings, () => openPermissionSettings())
  ipc.handle(IPC.captureList, () => listSources(getWindows()))
  ipc.handle(IPC.captureStart, (_e, opts: unknown) => capture.start(parseStartOptions(opts)))
  ipc.handle(IPC.captureStop, () => capture.stop())
  ipc.handle(IPC.captureCancel, () => capture.cancel())

  ipc.handle(IPC.mediaOpen, (_e, p: unknown) => openReader(str(p, 'path')))
  ipc.handle(IPC.mediaRead, (_e, h: unknown, s: unknown, end: unknown) => readRange(num(h, 'handle'), num(s, 'start'), num(end, 'end')))
  ipc.handle(IPC.mediaClose, (_e, h: unknown) => closeReader(num(h, 'handle')))
  ipc.handle(IPC.mediaExists, (_e, p: unknown) => {
    const path = canonical(str(p, 'path'))
    return isReadable(path) && existsSync(path)
  })
  ipc.handle(IPC.mediaChoose, async (e) => {
    const win = windowOf(e)
    const opts = {
      title: 'Choose a Video',
      properties: ['openFile' as const],
      filters: [{ name: 'Videos', extensions: [...VIDEO_EXTENSIONS] }],
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = res.filePaths[0]
    if (res.canceled || !file) return null
    allowRead(file)
    return canonical(file)
  })

  ipc.handle(IPC.mediaChooseAudio, async (e) => {
    const win = windowOf(e)
    const opts = { title: 'Add Audio', properties: ['openFile' as const], filters: [{ name: 'Audio', extensions: [...AUDIO_EXTENSIONS] }] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = res.filePaths[0]
    if (res.canceled || !file) return null
    allowRead(file)
    return canonical(file)
  })

  ipc.handle(IPC.projectCreatePath, (_e, name: unknown, folder: unknown) =>
    createProjectPath(str(name, 'name'), typeof folder === 'string' ? folder : undefined),
  )
  ipc.handle(IPC.projectSave, (_e, p: unknown, project: unknown, thumb: unknown) => saveProject(str(p, 'path'), project as Project, thumb))
  ipc.handle(IPC.projectSaveAs, (e, project: unknown, thumb: unknown) => saveProjectAs(windowOf(e), project as Project, thumb))
  ipc.handle(IPC.projectOpen, (_e, p: unknown) => openProject(str(p, 'path')))
  ipc.handle(IPC.projectChooseOpen, (e) => chooseAndOpenProject(windowOf(e)))
  ipc.handle(IPC.projectRecent, () => listRecents())
  ipc.handle(IPC.projectForget, (_e, p: unknown) => forgetRecent(str(p, 'path')))
  ipc.handle(IPC.projectRename, (_e, p: unknown, name: unknown) => renameRecent(str(p, 'path'), str(name, 'name')))
  ipc.handle(IPC.projectReveal, (_e, p: unknown) => revealRecent(str(p, 'path')))
  ipc.handle(IPC.projectReadCursor, (_e, p: unknown) => readCursorFile(str(p, 'path')))

  ipc.handle(IPC.exportChoose, async (e, name: unknown) => {
    const win = windowOf(e)
    const opts = {
      title: 'Export Video',
      defaultPath: join(app.getPath('desktop'), `${safeName(typeof name === 'string' ? name : 'FrameFlow')}.mp4`),
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    let path = res.filePath
    if (!path.toLowerCase().endsWith('.mp4')) path += '.mp4'
    allowExport(path)
    return canonical(path)
  })
  ipc.handle(IPC.exportBegin, (_e, p: unknown) => beginExport(str(p, 'path')))
  ipc.handle(IPC.exportWrite, (_e, h: unknown, pos: unknown, data: unknown) => {
    if (!(data instanceof Uint8Array)) throw new Error('Invalid export data.')
    return writeExport(num(h, 'handle'), num(pos, 'position'), data)
  })
  ipc.handle(IPC.exportFinish, async (_e, h: unknown) => {
    exported.add(await finishExport(num(h, 'handle')))
  })
  ipc.handle(IPC.exportAbort, (_e, h: unknown) => abortExport(num(h, 'handle')))
}

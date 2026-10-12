import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type StartRecordingOptions } from '@shared/ipc'
import type { Project } from '@shared/project'
import { allowExport, allowRead, canonical, isReadable } from './access'
import { CaptureController, listSources, openPermissionSettings, screenPermission } from './capture'
import { abortExport, beginExport, closeReader, finishExport, openReader, readRange, writeExport } from './fileHandles'
import { isTestMode, libraryPath, safeName } from './library'
import { chooseAndOpenProject, createProjectPath, forgetRecent, listRecents, openProject, readCursorFile, saveProject, saveProjectAs } from './projects'

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv']
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
    countdown: typeof o.countdown === 'number' ? o.countdown : 3,
  }
}

export function registerIpc(capture: CaptureController, getWindows: () => BrowserWindow[]): void {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion(), platform: process.platform, isTest: isTestMode(), libraryPath: libraryPath() }))
  ipcMain.handle(IPC.reveal, (_e, p: unknown) => {
    const path = canonical(str(p, 'path'))
    if (!isReadable(path) && !exported.has(path) && path !== canonical(libraryPath())) throw new Error('Not allowed.')
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.capturePermission, () => screenPermission())
  ipcMain.handle(IPC.captureOpenSettings, () => openPermissionSettings())
  ipcMain.handle(IPC.captureList, () => listSources(getWindows()))
  ipcMain.handle(IPC.captureStart, (_e, opts: unknown) => capture.start(parseStartOptions(opts)))
  ipcMain.handle(IPC.captureStop, () => capture.stop())
  ipcMain.handle(IPC.captureCancel, () => capture.cancel())

  ipcMain.handle(IPC.mediaOpen, (_e, p: unknown) => openReader(str(p, 'path')))
  ipcMain.handle(IPC.mediaRead, (_e, h: unknown, s: unknown, end: unknown) => readRange(num(h, 'handle'), num(s, 'start'), num(end, 'end')))
  ipcMain.handle(IPC.mediaClose, (_e, h: unknown) => closeReader(num(h, 'handle')))
  ipcMain.handle(IPC.mediaExists, (_e, p: unknown) => {
    const path = canonical(str(p, 'path'))
    return isReadable(path) && existsSync(path)
  })
  ipcMain.handle(IPC.mediaChoose, async (e) => {
    const win = windowOf(e)
    const opts = {
      title: 'Choose a Video',
      properties: ['openFile' as const],
      filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }],
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const file = res.filePaths[0]
    if (res.canceled || !file) return null
    allowRead(file)
    return canonical(file)
  })

  ipcMain.handle(IPC.projectCreatePath, (_e, name: unknown, folder: unknown) =>
    createProjectPath(str(name, 'name'), typeof folder === 'string' ? folder : undefined),
  )
  ipcMain.handle(IPC.projectSave, (_e, p: unknown, project: unknown, thumb: unknown) => saveProject(str(p, 'path'), project as Project, thumb))
  ipcMain.handle(IPC.projectSaveAs, (e, project: unknown, thumb: unknown) => saveProjectAs(windowOf(e), project as Project, thumb))
  ipcMain.handle(IPC.projectOpen, (_e, p: unknown) => openProject(str(p, 'path')))
  ipcMain.handle(IPC.projectChooseOpen, (e) => chooseAndOpenProject(windowOf(e)))
  ipcMain.handle(IPC.projectRecent, () => listRecents())
  ipcMain.handle(IPC.projectForget, (_e, p: unknown) => forgetRecent(str(p, 'path')))
  ipcMain.handle(IPC.projectReadCursor, (_e, p: unknown) => readCursorFile(str(p, 'path')))

  ipcMain.handle(IPC.exportChoose, async (e, name: unknown) => {
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
  ipcMain.handle(IPC.exportBegin, (_e, p: unknown) => beginExport(str(p, 'path')))
  ipcMain.handle(IPC.exportWrite, (_e, h: unknown, pos: unknown, data: unknown) => {
    if (!(data instanceof Uint8Array)) throw new Error('Invalid export data.')
    return writeExport(num(h, 'handle'), num(pos, 'position'), data)
  })
  ipcMain.handle(IPC.exportFinish, async (_e, h: unknown) => {
    exported.add(await finishExport(num(h, 'handle')))
  })
  ipcMain.handle(IPC.exportAbort, (_e, h: unknown) => abortExport(num(h, 'handle')))
}

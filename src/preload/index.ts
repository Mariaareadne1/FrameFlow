import { contextBridge, ipcRenderer } from 'electron'
import { IPC, mediaUrlFor, type CaptureEvent, type FrameFlowAPI } from '../shared/ipc'

const api: FrameFlowAPI = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    revealInFinder: (path) => ipcRenderer.invoke(IPC.reveal, path),
  },
  capture: {
    permission: () => ipcRenderer.invoke(IPC.capturePermission),
    openPermissionSettings: () => ipcRenderer.invoke(IPC.captureOpenSettings),
    listSources: () => ipcRenderer.invoke(IPC.captureList),
    start: (options) => ipcRenderer.invoke(IPC.captureStart, options),
    stop: () => ipcRenderer.invoke(IPC.captureStop),
    cancel: () => ipcRenderer.invoke(IPC.captureCancel),
    onEvent: (listener) => {
      const handler = (_e: unknown, event: CaptureEvent) => listener(event)
      ipcRenderer.on(IPC.captureEvent, handler)
      return () => ipcRenderer.removeListener(IPC.captureEvent, handler)
    },
  },
  media: {
    url: (path) => mediaUrlFor(path),
    open: (path) => ipcRenderer.invoke(IPC.mediaOpen, path),
    read: (handle, start, end) => ipcRenderer.invoke(IPC.mediaRead, handle, start, end),
    close: (handle) => ipcRenderer.invoke(IPC.mediaClose, handle),
    chooseVideo: () => ipcRenderer.invoke(IPC.mediaChoose),
    chooseAudio: () => ipcRenderer.invoke(IPC.mediaChooseAudio),
    exists: (path) => ipcRenderer.invoke(IPC.mediaExists, path),
  },
  project: {
    createPath: (name, folder) => ipcRenderer.invoke(IPC.projectCreatePath, name, folder),
    save: (path, project, thumbnail) => ipcRenderer.invoke(IPC.projectSave, path, project, thumbnail),
    saveAs: (project, thumbnail) => ipcRenderer.invoke(IPC.projectSaveAs, project, thumbnail),
    open: (path) => ipcRenderer.invoke(IPC.projectOpen, path),
    chooseAndOpen: () => ipcRenderer.invoke(IPC.projectChooseOpen),
    recent: () => ipcRenderer.invoke(IPC.projectRecent),
    forget: (path) => ipcRenderer.invoke(IPC.projectForget, path),
    rename: (path, name) => ipcRenderer.invoke(IPC.projectRename, path, name),
    reveal: (path) => ipcRenderer.invoke(IPC.projectReveal, path),
    readCursor: (path) => ipcRenderer.invoke(IPC.projectReadCursor, path),
  },
  export: {
    chooseDestination: (name) => ipcRenderer.invoke(IPC.exportChoose, name),
    begin: (path) => ipcRenderer.invoke(IPC.exportBegin, path),
    write: (handle, position, data) => ipcRenderer.invoke(IPC.exportWrite, handle, position, data),
    finish: (handle) => ipcRenderer.invoke(IPC.exportFinish, handle),
    abort: (handle) => ipcRenderer.invoke(IPC.exportAbort, handle),
  },
}

contextBridge.exposeInMainWorld('frameflow', api)

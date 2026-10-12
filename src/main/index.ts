import { app, BrowserWindow, Menu, session, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { CaptureController } from './capture'
import { closeAll } from './fileHandles'
import { registerIpc } from './ipc'
import { handleMediaScheme, registerMediaScheme } from './mediaProtocol'
import { createMainWindow } from './windows'

if (process.env.FRAMEFLOW_USER_DATA) app.setPath('userData', process.env.FRAMEFLOW_USER_DATA)
app.setName('FrameFlow')
registerMediaScheme()

let mainWindow: BrowserWindow | null = null
const capture = new CaptureController(() => mainWindow)

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  if (app.isPackaged) {
    // No developer tools in release builds.
    const view = template[3] as MenuItemConstructorOptions
    view.submenu = [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    delete view.role
    view.label = 'View'
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function openMain(): void {
  mainWindow = createMainWindow()
  mainWindow.on('closed', () => (mainWindow = null))
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    handleMediaScheme()
    // The renderer needs no browser permissions: capture happens in the native helper.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    buildMenu()
    registerIpc(capture, () => BrowserWindow.getAllWindows())
    openMain()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openMain()
    })
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    if (capture.isRecording) {
      event.preventDefault()
      quitting = true
      // Let the helper finalize the recording so it is not lost.
      void capture.shutdown().finally(() => closeAll().finally(() => app.quit()))
      return
    }
    quitting = true
    event.preventDefault()
    void closeAll().finally(() => app.quit())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || process.env.FRAMEFLOW_TEST === '1') app.quit()
  })
}

export const appRoot = join(__dirname, '..')

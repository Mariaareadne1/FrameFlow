import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'

const preload = join(__dirname, '../preload/index.cjs')

function loadRoute(win: BrowserWindow, route: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  }
}

function harden(win: BrowserWindow): void {
  // Never navigate away from the app or open new windows from content.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL ? url.startsWith(process.env.ELECTRON_RENDERER_URL) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })
}

const secureWebPreferences = {
  preload,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
  backgroundThrottling: false,
} as const

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'FrameFlow',
    backgroundColor: '#0c0d10',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: secureWebPreferences,
  })
  harden(win)
  win.once('ready-to-show', () => win.show())
  loadRoute(win, '/')
  return win
}

export function createHudWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const width = 300
  const height = 64
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + area.height - height - 28),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    fullscreenable: false,
    webPreferences: secureWebPreferences,
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Keep the HUD out of window recordings made by other apps, too.
  win.setContentProtection(true)
  harden(win)
  win.once('ready-to-show', () => win.showInactive())
  loadRoute(win, '/hud')
  return win
}

import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const preload = join(__dirname, '../preload/index.cjs')

function loadRoute(win: BrowserWindow, route: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${route}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  }
}

/** True only for FrameFlow's own renderer page (dev server or bundled index.html). */
export function isAppUrl(url: string): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev && !app.isPackaged) return url.startsWith(dev)
  return url.split('#')[0] === pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

function harden(win: BrowserWindow): void {
  // Never navigate away from the app or open new windows from content.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  win.webContents.on('will-frame-navigate', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
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

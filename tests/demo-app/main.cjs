// Minimal Electron app that shows the demo page in a normal window, for real-capture tests.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1000, height: 640, x: 120, y: 120, title: 'FrameFlow Demo Target', webPreferences: { sandbox: true } })
  win.loadFile(path.join(__dirname, 'index.html'))
})
app.on('window-all-closed', () => app.quit())

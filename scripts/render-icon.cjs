// Renders the app icon (build/icon.png, 1024x1024) from SVG using Electron itself.
// Run: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa3ff"/><stop offset="1" stop-color="#4b4be0"/></linearGradient>
    <radialGradient id="glow" cx="0.25" cy="0.15" r="0.9"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <filter id="s" x="-60%" y="-60%" width="220%" height="240%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.35"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#glow)"/>
  <rect x="268" y="330" width="488" height="352" rx="56" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="34"/>
  <rect x="390" y="420" width="244" height="178" rx="36" fill="#fff" filter="url(#s)"/>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html,<body style="margin:0;background:transparent">${encodeURIComponent(svg)}</body>`)
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '../build/icon.png'), image.resize({ width: 1024, height: 1024 }).toPNG())
  app.quit()
})

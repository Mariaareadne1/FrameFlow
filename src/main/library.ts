import { app } from 'electron'
import { join } from 'node:path'

/** Root folder for recordings and projects. Overridable for tests. */
export function libraryPath(): string {
  return process.env.FRAMEFLOW_LIBRARY || join(app.getPath('videos'), 'FrameFlow')
}

export function isTestMode(): boolean {
  return process.env.FRAMEFLOW_TEST === '1'
}

/** "Demo 2026-10-12 15.04.33" style, safe on every filesystem. */
export function timestampLabel(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

export function safeName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\0]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned.replace(/^\.+/, '') || 'Untitled'
}

import { isAbsolute, normalize, resolve } from 'node:path'

/**
 * Paths the renderer is allowed to touch. The renderer never gets arbitrary filesystem
 * access: a path becomes readable only after the user picked it in a dialog, it came from
 * a recording we made, or it is referenced by a project the user opened.
 */
const readable = new Set<string>()
const writableExports = new Set<string>()
const projectFiles = new Set<string>()

export function canonical(p: string): string {
  if (typeof p !== 'string' || p.length === 0 || p.length > 4096 || p.includes('\0')) {
    throw new Error('Invalid path.')
  }
  if (!isAbsolute(p)) throw new Error('Path must be absolute.')
  return normalize(resolve(p))
}

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'] as const

export function isVideoPath(p: string): boolean {
  const ext = p.toLowerCase().split('.').pop() ?? ''
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext)
}

export function allowRead(p: string): void {
  readable.add(canonical(p))
}

export function assertReadable(p: string): string {
  const c = canonical(p)
  if (!readable.has(c)) throw new Error('Access to this file was not granted.')
  return c
}

export function isReadable(p: string): boolean {
  try {
    return readable.has(canonical(p))
  } catch {
    return false
  }
}

export function allowExport(p: string): void {
  writableExports.add(canonical(p))
}

/** Consumes a one-time grant to write an export to `p`. */
export function consumeExportGrant(p: string): string {
  const c = canonical(p)
  if (!writableExports.has(c)) throw new Error('Export destination was not chosen by the user.')
  if (!c.toLowerCase().endsWith('.mp4')) throw new Error('Exports must be .mp4 files.')
  writableExports.delete(c)
  return c
}

export function allowProject(p: string): void {
  projectFiles.add(canonical(p))
}

export function assertProject(p: string): string {
  const c = canonical(p)
  if (!projectFiles.has(c)) throw new Error('Access to this project was not granted.')
  return c
}

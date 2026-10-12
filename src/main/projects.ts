import { promises as fs, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, dialog, BrowserWindow } from 'electron'
import { PROJECT_FILE_EXTENSION, type Project, type RecentProject } from '@shared/project'
import { parseProject } from '@shared/projectModel'
import type { OpenedProject } from '@shared/ipc'
import { allowProject, allowRead, assertProject, canonical, isReadable } from './access'
import { libraryPath, safeName, timestampLabel } from './library'

const MAX_RECENTS = 24
const MAX_THUMBNAIL = 400_000
/** Folders created by the recorder; projects may be created inside them. */
const ownedFolders = new Set<string>()

export function registerOwnedFolder(folder: string): void {
  ownedFolders.add(canonical(folder))
}

function recentsFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

async function readRecents(): Promise<RecentProject[]> {
  try {
    const raw = JSON.parse(await fs.readFile(recentsFile(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (r): r is RecentProject => !!r && typeof r === 'object' && typeof (r as RecentProject).path === 'string' && typeof (r as RecentProject).name === 'string',
    )
  } catch {
    return []
  }
}

async function writeRecents(list: RecentProject[]): Promise<void> {
  await atomicWrite(recentsFile(), JSON.stringify(list.slice(0, MAX_RECENTS), null, 2))
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, contents, 'utf8')
  await fs.rename(tmp, path)
}

async function touchRecent(path: string, project: Project, thumbnail: string | null): Promise<void> {
  const list = await readRecents()
  const previous = list.find((r) => r.path === path)
  const entry: RecentProject = {
    path,
    name: project.name,
    updatedAt: project.updatedAt,
    duration: project.media.duration,
    thumbnail: thumbnail ?? previous?.thumbnail ?? null,
  }
  await writeRecents([entry, ...list.filter((r) => r.path !== path)])
}

function validThumbnail(t: unknown): string | null {
  return typeof t === 'string' && t.startsWith('data:image/jpeg;base64,') && t.length < MAX_THUMBNAIL ? t : null
}

export async function createProjectPath(name: string, folder?: string): Promise<string> {
  const base = safeName(name)
  let dir: string
  if (folder) {
    dir = canonical(folder)
    if (!ownedFolders.has(dir)) throw new Error('Unknown project folder.')
  } else {
    dir = join(libraryPath(), `${base} ${timestampLabel()}`)
    await fs.mkdir(dir, { recursive: true })
  }
  const path = join(dir, `${base}.${PROJECT_FILE_EXTENSION}`)
  allowProject(path)
  return path
}

export async function saveProject(path: string, project: Project, thumbnail: unknown): Promise<void> {
  const p = assertProject(path)
  // Validate before writing so a renderer bug can never persist a corrupt project.
  const clean = parseProject(project)
  if (!isReadable(clean.media.path)) throw new Error('Project references a file that was not granted.')
  await atomicWrite(p, JSON.stringify(clean, null, 2))
  await touchRecent(p, clean, validThumbnail(thumbnail))
}

export async function saveProjectAs(win: BrowserWindow | null, project: Project, thumbnail: unknown): Promise<string | null> {
  const opts = {
    title: 'Save Project',
    defaultPath: join(libraryPath(), `${safeName(project.name)}.${PROJECT_FILE_EXTENSION}`),
    filters: [{ name: 'FrameFlow Project', extensions: [PROJECT_FILE_EXTENSION] }],
  }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  let path = res.filePath
  if (!path.endsWith(`.${PROJECT_FILE_EXTENSION}`)) path += `.${PROJECT_FILE_EXTENSION}`
  allowProject(path)
  await saveProject(path, project, thumbnail)
  return canonical(path)
}

export async function openProject(path: string): Promise<OpenedProject> {
  const p = canonical(path)
  if (!p.endsWith(`.${PROJECT_FILE_EXTENSION}`)) throw new Error('Not a FrameFlow project file.')
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(p, 'utf8'))
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    throw new Error(code === 'ENOENT' ? 'The project file could not be found. It may have been moved or deleted.' : 'The project file is damaged and could not be read.')
  }
  const project = parseProject(raw)
  allowProject(p)
  allowRead(project.media.path)
  let cursor: unknown = null
  if (project.media.cursorPath) {
    try {
      cursor = JSON.parse(await fs.readFile(canonical(project.media.cursorPath), 'utf8'))
    } catch {
      cursor = null
    }
  }
  await touchRecent(p, project, null)
  return { path: p, project, mediaMissing: !existsSync(project.media.path), cursor }
}

export async function chooseAndOpenProject(win: BrowserWindow | null): Promise<OpenedProject | null> {
  const opts = {
    title: 'Open Project',
    defaultPath: libraryPath(),
    properties: ['openFile' as const],
    filters: [{ name: 'FrameFlow Project', extensions: [PROJECT_FILE_EXTENSION] }],
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  const file = res.filePaths[0]
  if (res.canceled || !file) return null
  return openProject(file)
}

export async function listRecents(): Promise<RecentProject[]> {
  const list = await readRecents()
  // Hide entries whose project file disappeared, but keep them on disk (drives can be unplugged).
  return list.filter((r) => existsSync(r.path))
}

export async function forgetRecent(path: string): Promise<void> {
  const list = await readRecents()
  await writeRecents(list.filter((r) => r.path !== path))
}

export async function readCursorFile(path: string): Promise<unknown> {
  const p = canonical(path)
  if (!isReadable(p)) throw new Error('Access to this file was not granted.')
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

import { promises as fs, existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { app, dialog, shell, BrowserWindow } from 'electron'
import { PROJECT_FILE_EXTENSION, PROJECT_FORMAT_VERSION, type Project, type RecentProject } from '@shared/project'
import { parseProject } from '@shared/projectModel'
import type { OpenedProject } from '@shared/ipc'
import { allowProject, allowRead, assertProject, canonical, isReadable, isVideoPath } from './access'
import { libraryPath, safeName, timestampLabel } from './library'

const MAX_RECENTS = 200
let tmpCounter = 0
let recentsQueue: Promise<unknown> = Promise.resolve()

/** Serializes read-modify-write of the recents file. */
function withRecents<T>(fn: () => Promise<T>): Promise<T> {
  const next = recentsQueue.then(fn, fn)
  recentsQueue = next.catch(() => undefined)
  return next
}
const MAX_THUMBNAIL = 400_000
/** Folders created by the recorder; projects may be created inside them. */
const ownedFolders = new Set<string>()

export function registerOwnedFolder(folder: string): void {
  ownedFolders.add(canonical(folder))
}

function recentsFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

/** What is stored on disk for each recent project (the media path is never sent to the UI). */
type StoredRecent = RecentProject & { mediaPath?: string }

async function readRecents(): Promise<StoredRecent[]> {
  try {
    const raw = JSON.parse(await fs.readFile(recentsFile(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (r): r is StoredRecent => !!r && typeof r === 'object' && typeof (r as RecentProject).path === 'string' && typeof (r as RecentProject).name === 'string',
    )
  } catch {
    return []
  }
}

async function writeRecents(list: StoredRecent[]): Promise<void> {
  await atomicWrite(recentsFile(), JSON.stringify(list.slice(0, MAX_RECENTS), null, 2))
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`
  await fs.writeFile(tmp, contents, 'utf8')
  await fs.rename(tmp, path)
}

function touchRecent(path: string, project: Project, thumbnail: string | null): Promise<void> {
  return withRecents(() => touchRecentNow(path, project, thumbnail))
}

async function touchRecentNow(path: string, project: Project, thumbnail: string | null): Promise<void> {
  const list = await readRecents()
  const previous = list.find((r) => r.path === path)
  const entry: StoredRecent = {
    path,
    name: project.name,
    updatedAt: project.updatedAt,
    duration: project.media.duration,
    thumbnail: thumbnail ?? previous?.thumbnail ?? null,
    aspectRatio: project.aspectRatio,
    mediaPath: project.media.path,
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

/**
 * Before an older-format project is overwritten for the first time, keep a copy of the
 * original (`<file>.v1.bak`) so a migration can always be undone by hand.
 */
async function backupIfOlderFormat(p: string): Promise<void> {
  try {
    const existing = JSON.parse(await fs.readFile(p, 'utf8')) as { version?: unknown }
    const version = typeof existing.version === 'number' ? existing.version : null
    if (version === null || version >= PROJECT_FORMAT_VERSION) return
    const backup = `${p}.v${version}.bak`
    if (!existsSync(backup)) await fs.copyFile(p, backup)
  } catch {
    // No existing file (new project) or unreadable: nothing to preserve.
  }
}

async function writeProjectFile(p: string, clean: Project, thumbnail: string | null): Promise<void> {
  await backupIfOlderFormat(p)
  await atomicWrite(p, JSON.stringify(clean, null, 2))
  await touchRecent(p, clean, thumbnail)
}

export async function saveProject(path: string, project: Project, thumbnail: unknown): Promise<void> {
  const p = assertProject(path)
  // Validate before writing so a renderer bug can never persist a corrupt project.
  const clean = parseProject(project)
  if (!isReadable(clean.media.path)) throw new Error('Project references a file that was not granted.')
  await writeProjectFile(p, clean, validThumbnail(thumbnail))
}

async function assertRecent(path: string): Promise<string> {
  const p = canonical(path)
  if (!(await readRecents()).some((r) => r.path === p)) throw new Error('That project is not in Recents.')
  return p
}

/** Renames a recent project (the name inside the file; the file itself is not moved). */
export async function renameRecent(path: string, name: string): Promise<void> {
  const p = await assertRecent(path)
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) throw new Error('A project needs a name.')
  const project = parseProject(JSON.parse(await fs.readFile(p, 'utf8')))
  await writeProjectFile(p, { ...project, name: trimmed, updatedAt: new Date().toISOString() }, null)
}

export async function revealRecent(path: string): Promise<void> {
  shell.showItemInFolder(await assertRecent(path))
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

const MAX_CURSOR_FILE = 100 * 1024 * 1024

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function realFile(p: string): Promise<string | null> {
  try {
    const real = await fs.realpath(canonical(p))
    return (await fs.stat(real)).isFile() ? real : null
  } catch {
    return null
  }
}

/**
 * Project files are untrusted input (they can be shared). A project may only grant access to
 * its video when that is clearly safe: the path is a video file AND either the project lives
 * in the FrameFlow library, the video sits in the project's own folder, or this project was
 * previously saved/opened by FrameFlow (it is in Recents). Otherwise the user must confirm the
 * video through a file dialog ("Locate Video…").
 */
async function trustedMediaPath(projectPath: string, mediaPath: string, recents: RecentProject[]): Promise<string | null> {
  if (!isVideoPath(mediaPath)) return null
  const media = await realFile(mediaPath)
  if (!media) return null
  const projectDir = dirname(projectPath)
  const library = canonical(libraryPath())
  const trusted = isInside(projectPath, library) || isInside(media, projectDir) || recents.some((r) => r.path === projectPath)
  return trusted ? media : null
}

/** Cursor data must be a regular, reasonably sized .json file next to the video. */
async function readTrustedCursor(cursorPath: string, mediaPath: string): Promise<unknown> {
  if (!cursorPath.toLowerCase().endsWith('.json')) return null
  const real = await realFile(cursorPath)
  if (!real || dirname(real) !== dirname(mediaPath)) return null
  if ((await fs.stat(real)).size > MAX_CURSOR_FILE) return null
  allowRead(real)
  return JSON.parse(await fs.readFile(real, 'utf8'))
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
  const recents = await readRecents()
  const media = await trustedMediaPath(p, project.media.path, recents)
  let cursor: unknown = null
  if (media) {
    allowRead(media)
    allowRead(project.media.path)
    if (project.media.cursorPath) cursor = await readTrustedCursor(project.media.cursorPath, media).catch(() => null)
  }
  await touchRecent(p, project, null)
  return { path: p, project, mediaMissing: !media, cursor }
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
  return list
    .filter((r) => r.path.endsWith(`.${PROJECT_FILE_EXTENSION}`) && existsSync(r.path))
    .map(({ mediaPath, ...r }) => ({ ...r, mediaMissing: typeof mediaPath === 'string' ? !existsSync(mediaPath) : false }))
}

export async function forgetRecent(path: string): Promise<void> {
  await withRecents(async () => {
    const list = await readRecents()
    await writeRecents(list.filter((r) => r.path !== path))
  })
}

export async function readCursorFile(path: string): Promise<unknown> {
  const p = canonical(path)
  if (!isReadable(p) || !p.endsWith('.json')) throw new Error('Access to this file was not granted.')
  if ((await fs.stat(p)).size > MAX_CURSOR_FILE) throw new Error('Cursor data is too large.')
  return JSON.parse(await fs.readFile(p, 'utf8'))
}

import { promises as fs } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { assertReadable, consumeExportGrant, isVideoPath } from './access'

/** Random-access read handles used by the exporter's demuxer. */
const readers = new Map<number, FileHandle>()
let nextReader = 1

const MAX_READ = 64 * 1024 * 1024
/** Hard ceiling for a single export file (well above any realistic demo). */
const MAX_EXPORT_BYTES = 64 * 1024 * 1024 * 1024

export async function openReader(path: string): Promise<{ handle: number; size: number }> {
  const p = assertReadable(path)
  if (!isVideoPath(p)) throw new Error('Only video files can be opened.')
  const fh = await fs.open(p, 'r')
  const { size } = await fh.stat()
  const handle = nextReader++
  readers.set(handle, fh)
  return { handle, size }
}

export async function readRange(handle: number, start: number, end: number): Promise<Uint8Array> {
  const fh = readers.get(handle)
  if (!fh) throw new Error('Media handle is closed.')
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end - start > MAX_READ) {
    throw new Error('Invalid read range.')
  }
  const buf = Buffer.alloc(end - start)
  const { bytesRead } = await fh.read(buf, 0, end - start, start)
  return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead)
}

export async function closeReader(handle: number): Promise<void> {
  const fh = readers.get(handle)
  readers.delete(handle)
  await fh?.close()
}

/**
 * Export writers stream into "<dest>.partial" and only rename onto the destination once
 * the file is complete, so an interrupted export never leaves a corrupt .mp4 behind.
 */
interface Writer {
  fh: FileHandle
  dest: string
  temp: string
}
const writers = new Map<number, Writer>()
let nextWriter = 1

export async function beginExport(path: string): Promise<number> {
  const dest = consumeExportGrant(path)
  const temp = `${dest}.partial`
  // Remove a stale partial (or a planted symlink) and create exclusively, never following links.
  await fs.rm(temp, { force: true })
  const fh = await fs.open(temp, 'wx')
  const handle = nextWriter++
  writers.set(handle, { fh, dest, temp })
  return handle
}

export async function writeExport(handle: number, position: number, data: Uint8Array): Promise<void> {
  const w = writers.get(handle)
  if (!w) throw new Error('Export is not active.')
  if (!Number.isInteger(position) || position < 0 || position + data.byteLength > MAX_EXPORT_BYTES) throw new Error('Invalid write position.')
  await w.fh.write(data, 0, data.byteLength, position)
}

export async function finishExport(handle: number): Promise<string> {
  const w = writers.get(handle)
  if (!w) throw new Error('Export is not active.')
  writers.delete(handle)
  await w.fh.sync()
  await w.fh.close()
  await fs.rename(w.temp, w.dest)
  return w.dest
}

export async function abortExport(handle: number): Promise<void> {
  const w = writers.get(handle)
  if (!w) return
  writers.delete(handle)
  await w.fh.close().catch(() => undefined)
  await fs.rm(w.temp, { force: true })
}

export async function closeAll(): Promise<void> {
  for (const h of [...writers.keys()]) await abortExport(h)
  for (const h of [...readers.keys()]) await closeReader(h)
}

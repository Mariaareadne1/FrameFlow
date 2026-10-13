import { createReadStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import { extname } from 'node:path'
import { protocol } from 'electron'
import { MEDIA_SCHEME, pathFromMediaUrl } from '@shared/ipc'
import { isMediaPath, isReadable } from './access'

const CORS = { 'Access-Control-Allow-Origin': '*' }

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.caf': 'audio/x-caf',
  '.aiff': 'audio/aiff',
}

/** Must run before app 'ready'. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
  ])
}

/**
 * Serves granted media files with HTTP range support so <video> can seek without
 * loading whole recordings into memory.
 */
export function handleMediaScheme(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const path = pathFromMediaUrl(request.url)
    if (!path || !isMediaPath(path) || !isReadable(path)) return new Response('Forbidden', { status: 403 })
    let size: number
    try {
      size = (await fs.stat(path)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }
    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('range')
    const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
    if (match && (match[1] || match[2])) {
      let start = match[1] ? Number(match[1]) : size - Number(match[2])
      let end = match[1] && match[2] ? Number(match[2]) : size - 1
      start = Math.max(0, start)
      end = Math.min(size - 1, end)
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          ...CORS,
        },
      })
    }
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', ...CORS },
    })
  })
}

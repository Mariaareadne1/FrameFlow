import type { ClickEvent, CursorTrack, Project, ZoomEvent } from '@shared/project'
import { resolveBackground, type BackgroundPreset } from '@shared/styles'
import { CAMERA_SMOOTH_TIME, buildSmoothPath, cursorSmoothTime, pathAt, type SmoothPath } from '@shared/engine/cursor'
import { cameraAt, effectiveZooms, projectToViewport, viewportOf, type Camera } from '@shared/engine/camera'
import { computeLayout, type FrameLayout, type Size } from '@shared/engine/layout'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * Everything needed to draw any frame of a project. Built once per edit; drawing a frame
 * is then a pure function of (scene, source pixels, time).
 */
export interface RenderScene {
  srcW: number
  srcH: number
  frame: Project['frame']
  background: BackgroundPreset
  zooms: ZoomEvent[]
  cursor: Project['cursor'] & { enabled: boolean }
  cursorPath: SmoothPath | null
  cameraPath: SmoothPath | null
  clicks: ClickEvent[]
}

export function buildScene(project: Project, track: CursorTrack | null): RenderScene {
  const hasTrack = !!track && track.samples.length > 0
  const duration = project.media.duration
  return {
    srcW: project.media.width,
    srcH: project.media.height,
    frame: project.frame,
    background: resolveBackground(project.background),
    zooms: effectiveZooms(project.zooms),
    cursor: { ...project.cursor, enabled: hasTrack && project.cursor.visible && !project.media.cursorEmbedded },
    cursorPath: hasTrack ? buildSmoothPath(track.samples, duration, cursorSmoothTime(project.cursor.smoothing)) : null,
    cameraPath: hasTrack ? buildSmoothPath(track.samples, duration, CAMERA_SMOOTH_TIME) : null,
    clicks: hasTrack ? track.clicks : [],
  }
}

export function sceneCamera(scene: RenderScene, t: number): Camera {
  return cameraAt(scene.zooms, scene.cameraPath, t)
}

// ---------------------------------------------------------------------------------------

function paintBackground(ctx: Ctx2D, size: Size, bg: BackgroundPreset): void {
  const { width: W, height: H } = size
  ctx.fillStyle = bg.base
  ctx.fillRect(0, 0, W, H)
  const diag = Math.hypot(W, H)
  for (const layer of bg.layers) {
    if (layer.type === 'linear') {
      const a = ((layer.angle - 90) * Math.PI) / 180
      const dx = (Math.cos(a) * diag) / 2
      const dy = (Math.sin(a) * diag) / 2
      const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy)
      for (const [offset, color] of layer.stops) g.addColorStop(offset, color)
      ctx.fillStyle = g
    } else {
      const cx = layer.x * W
      const cy = layer.y * H
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.radius * diag)
      g.addColorStop(0, layer.color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
    }
    ctx.fillRect(0, 0, W, H)
  }
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Background + drop shadow never change during playback, so they are cached. */
const backdropCache = new Map<string, OffscreenCanvas>()
const BACKDROP_CACHE_LIMIT = 4

function getBackdrop(size: Size, scene: RenderScene, layout: FrameLayout): OffscreenCanvas {
  const key = JSON.stringify([size.width, size.height, scene.background, layout.video, layout.radius, layout.shadow])
  const hit = backdropCache.get(key)
  if (hit) return hit
  const canvas = new OffscreenCanvas(size.width, size.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a 2D canvas for the background.')
  paintBackground(ctx, size, scene.background)
  const { video: v, radius, shadow } = layout
  if (shadow.alpha > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`
    ctx.shadowBlur = shadow.blur
    ctx.shadowOffsetY = shadow.offsetY
    ctx.fillStyle = '#000'
    roundRectPath(ctx, v.x, v.y, v.w, v.h, radius)
    ctx.fill()
    // A tighter contact shadow grounds the frame.
    ctx.shadowColor = `rgba(0,0,0,${shadow.alpha * 0.6})`
    ctx.shadowBlur = shadow.blur * 0.2
    ctx.shadowOffsetY = shadow.offsetY * 0.2
    ctx.fill()
    ctx.restore()
  }
  if (backdropCache.size >= BACKDROP_CACHE_LIMIT) {
    const oldest = backdropCache.keys().next().value
    if (oldest !== undefined) backdropCache.delete(oldest)
  }
  backdropCache.set(key, canvas)
  return canvas
}

// Classic arrow pointer, authored in a 32-unit box with the hotspot at (0,0).
const ARROW = new Path2D('M0 0 L0 23.5 L5.6 18.2 L9.4 27.2 L13.4 25.5 L9.7 16.7 L17.2 16.7 Z')

function drawCursor(ctx: Ctx2D, x: number, y: number, size: number, press: number): void {
  const s = (size / 32) * (1 - 0.12 * press)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#ffffff'
  ctx.fill(ARROW)
  ctx.shadowColor = 'transparent'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#111111'
  ctx.stroke(ARROW)
  ctx.restore()
}

const CLICK_EFFECT_DURATION = 0.5

function drawClicks(ctx: Ctx2D, scene: RenderScene, t: number, toCanvas: (x: number, y: number) => [number, number], size: number): number {
  let press = 0
  for (const c of scene.clicks) {
    const age = t - c.t
    if (age < -0.05 || age > CLICK_EFFECT_DURATION) continue
    press = Math.max(press, age < 0 ? 1 + age / 0.05 : Math.max(0, 1 - age / 0.15))
    if (!scene.cursor.clickEffect || age < 0) continue
    const k = age / CLICK_EFFECT_DURATION
    const [px, py] = toCanvas(c.x, c.y)
    const eased = 1 - Math.pow(1 - k, 3)
    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, size * (0.25 + 0.9 * eased), 0, Math.PI * 2)
    ctx.lineWidth = Math.max(1, size * 0.08 * (1 - k))
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`
    ctx.fillStyle = `rgba(120,150,255,${0.25 * (1 - k)})`
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  return press
}

/**
 * Draws one output frame.
 * @param source decoded source pixels (video element in preview, VideoFrame in export)
 * @param t source time in seconds
 */
export function renderFrame(ctx: Ctx2D, size: Size, scene: RenderScene, source: CanvasImageSource | null, t: number): void {
  const layout = computeLayout(size, scene.srcW, scene.srcH, scene.frame)
  const { video: v, radius } = layout
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(getBackdrop(size, scene, layout), 0, 0)

  ctx.save()
  roundRectPath(ctx, v.x, v.y, v.w, v.h, radius)
  ctx.clip()
  ctx.fillStyle = '#000'
  ctx.fillRect(v.x, v.y, v.w, v.h)

  const cam = sceneCamera(scene, t)
  const vp = viewportOf(cam)
  if (source) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, vp.x * scene.srcW, vp.y * scene.srcH, vp.w * scene.srcW, vp.h * scene.srcH, v.x, v.y, v.w, v.h)
  }

  if (scene.cursor.enabled && scene.cursorPath) {
    const toCanvas = (x: number, y: number): [number, number] => {
      const p = projectToViewport({ x, y }, vp)
      return [v.x + p.x * v.w, v.y + p.y * v.h]
    }
    // Cursor size tracks the content: ~2.2% of the source height, magnified by the zoom.
    const size = (v.h / 1) * 0.022 * scene.cursor.size * cam.scale * 1.45
    const press = drawClicks(ctx, scene, t, toCanvas, size)
    const p = pathAt(scene.cursorPath, t)
    const [cx, cy] = toCanvas(p.x, p.y)
    drawCursor(ctx, cx, cy, size, press)
  }
  ctx.restore()

  // Hairline edge so light content still reads as a window against light backgrounds.
  ctx.save()
  roundRectPath(ctx, v.x + 0.5, v.y + 0.5, v.w - 1, v.h - 1, radius)
  ctx.lineWidth = Math.max(1, layout.unit)
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.stroke()
  ctx.restore()
  ctx.restore()
}

import type { ClickEvent, CursorTrack, Project, ZoomEvent } from '@shared/project'
import { resolveBackground, type BackgroundPreset } from '@shared/styles'
import { buildCameraPath, buildSmoothPath, cameraSmoothTime, cursorSmoothTime, pathAt, type SmoothPath } from '@shared/engine/cursor'
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

/**
 * Smoothed paths depend only on telemetry and a few numbers, so they are memoized per track:
 * restyling or editing Moments never recomputes them.
 */
const pathCache = new WeakMap<CursorTrack, Map<string, SmoothPath>>()

function cachedPath(track: CursorTrack, key: string, build: () => SmoothPath): SmoothPath {
  let byKey = pathCache.get(track)
  if (!byKey) {
    byKey = new Map()
    pathCache.set(track, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const path = build()
  if (byKey.size > 12) byKey.delete(byKey.keys().next().value as string)
  byKey.set(key, path)
  return path
}

export function buildScene(project: Project, track: CursorTrack | null): RenderScene {
  const hasTrack = !!track && track.samples.length > 0
  const duration = project.media.duration
  const cursorSmooth = cursorSmoothTime(project.cursor.smoothing)
  const camSmooth = cameraSmoothTime(project.camera.followSmoothing)
  const deadzone = project.camera.deadzone
  return {
    srcW: project.media.width,
    srcH: project.media.height,
    frame: project.frame,
    background: resolveBackground(project.background),
    zooms: effectiveZooms(project.zooms),
    cursor: { ...project.cursor, enabled: hasTrack && project.cursor.visible && !project.media.cursorEmbedded },
    cursorPath: hasTrack ? cachedPath(track, `c:${duration}:${cursorSmooth}`, () => buildSmoothPath(track.samples, duration, cursorSmooth)) : null,
    cameraPath: hasTrack ? cachedPath(track, `k:${duration}:${camSmooth}:${deadzone}`, () => buildCameraPath(track.samples, duration, camSmooth, deadzone)) : null,
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
    } else if (layer.type === 'radial') {
      const cx = layer.x * W
      const cy = layer.y * H
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, layer.radius * diag)
      g.addColorStop(0, layer.color)
      g.addColorStop(1, layer.soft ? transparentOf(layer.color) : 'rgba(0,0,0,0)')
      ctx.fillStyle = g
    } else if (layer.type === 'vignette') {
      const g = ctx.createRadialGradient(W / 2, H / 2, (layer.inner * diag) / 2, W / 2, H / 2, (layer.outer * diag) / 2)
      g.addColorStop(0, transparentOf(layer.color))
      g.addColorStop(1, layer.color)
      ctx.fillStyle = g
    } else {
      paintGrain(ctx, size, layer.amount, layer.seed)
      continue
    }
    ctx.fillRect(0, 0, W, H)
  }
}

/** Deterministic PRNG so grain is identical in preview, export and every frame. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GRAIN_TILE = 160
const grainTiles = new Map<number, OffscreenCanvas>()

function grainTile(seed: number): OffscreenCanvas {
  const hit = grainTiles.get(seed)
  if (hit) return hit
  const tile = new OffscreenCanvas(GRAIN_TILE, GRAIN_TILE)
  const tctx = tile.getContext('2d')!
  const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE)
  const rand = mulberry32(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(rand() * 255)
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  tctx.putImageData(img, 0, 0)
  grainTiles.set(seed, tile)
  return tile
}

/** Paper grain. Grain size scales with the output so preview and export read the same. */
function paintGrain(ctx: Ctx2D, size: Size, amount: number, seed: number): void {
  const pattern = ctx.createPattern(grainTile(seed), 'repeat')
  if (!pattern) return
  const unit = Math.min(size.width, size.height) / 1080
  pattern.setTransform(new DOMMatrix().scaleSelf(1.4 * unit, 1.4 * unit))
  ctx.save()
  ctx.globalAlpha = amount
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.restore()
}

/** The same colour with zero alpha, so gradients fade without passing through grey. */
function transparentOf(color: string): string {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(color)
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},0)`
  if (color.startsWith('#')) {
    const [r, g, b] = hexToRgb(color)
    return `rgba(${r},${g},${b},0)`
  }
  return 'rgba(0,0,0,0)'
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Background + drop shadow never change during playback, so they are cached. */
const backdropCache = new Map<string, OffscreenCanvas>()
const BACKDROP_CACHE_LIMIT = 4

function getBackdrop(size: Size, scene: RenderScene, layout: FrameLayout): OffscreenCanvas {
  const key = JSON.stringify([size.width, size.height, scene.background, layout.video, layout.radius, layout.shadow, scene.frame.shadowTint ?? null])
  const hit = backdropCache.get(key)
  if (hit) return hit
  const canvas = new OffscreenCanvas(size.width, size.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a 2D canvas for the background.')
  paintBackground(ctx, size, scene.background)
  const { video: v, radius, shadow } = layout
  if (shadow.alpha > 0) {
    const [r, g, b] = scene.frame.shadowTint ? hexToRgb(scene.frame.shadowTint) : [0, 0, 0]
    ctx.save()
    ctx.shadowColor = `rgba(${r},${g},${b},${shadow.alpha})`
    ctx.shadowBlur = shadow.blur
    ctx.shadowOffsetY = shadow.offsetY
    ctx.fillStyle = '#000'
    roundRectPath(ctx, v.x, v.y, v.w, v.h, radius)
    ctx.fill()
    // A tighter contact shadow grounds the frame.
    ctx.shadowColor = `rgba(${r},${g},${b},${shadow.alpha * 0.6})`
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
const SPOTLIGHT_DURATION = 0.9

type ToCanvas = (x: number, y: number) => [number, number]

/** Press amount 0..1 around clicks: the pointer squashes slightly (every treatment). */
function pressAt(scene: RenderScene, t: number): number {
  let press = 0
  for (const c of scene.clicks) {
    const age = t - c.t
    if (age < -0.05 || age > 0.15) continue
    press = Math.max(press, age < 0 ? 1 + age / 0.05 : Math.max(0, 1 - age / 0.15))
  }
  return press
}

/** Pulse: an expanding, fading ring (the 0.1 ripple; intensity 1 is pixel-identical). */
function drawPulse(ctx: Ctx2D, scene: RenderScene, t: number, toCanvas: ToCanvas, size: number, intensity: number): void {
  for (const c of scene.clicks) {
    const age = t - c.t
    if (age < 0 || age > CLICK_EFFECT_DURATION) continue
    const k = age / CLICK_EFFECT_DURATION
    const [px, py] = toCanvas(c.x, c.y)
    const eased = 1 - Math.pow(1 - k, 3)
    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, size * (0.25 + 0.9 * eased), 0, Math.PI * 2)
    ctx.lineWidth = Math.max(1, size * 0.08 * (1 - k))
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k) * intensity})`
    ctx.fillStyle = `rgba(120,150,255,${0.25 * (1 - k) * intensity})`
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

/** Halo: a soft lavender disc under the pointer that swells gently on clicks. */
function drawHalo(ctx: Ctx2D, scene: RenderScene, t: number, x: number, y: number, size: number, intensity: number): void {
  let swell = 0
  for (const c of scene.clicks) {
    const age = t - c.t
    if (age < -0.08 || age > 0.45) continue
    const k = age < 0 ? 1 + age / 0.08 : 1 - age / 0.45
    swell = Math.max(swell, Math.sin((Math.max(0, k) * Math.PI) / 2))
  }
  const r = size * (0.72 + 0.3 * swell)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(170,154,207,${(0.42 + 0.18 * swell) * intensity})`)
  g.addColorStop(0.7, `rgba(170,154,207,${(0.22 + 0.12 * swell) * intensity})`)
  g.addColorStop(1, 'rgba(170,154,207,0)')
  ctx.save()
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = Math.max(1, size * 0.035)
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * intensity})`
  ctx.beginPath()
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Spotlight: after a click, gently quiets everything except the area around it. A soft
 * radial falloff, never a hard mask, and at most a light dimming so content stays readable.
 */
function drawSpotlight(ctx: Ctx2D, scene: RenderScene, t: number, toCanvas: ToCanvas, size: number, area: { x: number; y: number; w: number; h: number }, intensity: number): void {
  for (const c of scene.clicks) {
    const age = t - c.t
    if (age < -0.12 || age > SPOTLIGHT_DURATION) continue
    const env = age < 0 ? 1 + age / 0.12 : age < 0.45 ? 1 : 1 - (age - 0.45) / (SPOTLIGHT_DURATION - 0.45)
    const e = Math.sin((Math.max(0, Math.min(1, env)) * Math.PI) / 2)
    const [px, py] = toCanvas(c.x, c.y)
    const inner = size * 2.2
    const outer = size * 7
    const g = ctx.createRadialGradient(px, py, inner, px, py, outer)
    g.addColorStop(0, 'rgba(12,12,22,0)')
    g.addColorStop(1, `rgba(12,12,22,${0.24 * intensity * e})`)
    ctx.save()
    ctx.fillStyle = g
    ctx.fillRect(area.x, area.y, area.w, area.h)
    ctx.lineWidth = Math.max(1, size * 0.04)
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * intensity * e})`
    ctx.beginPath()
    ctx.arc(px, py, inner * 0.9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
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
    const intensity = scene.cursor.effectIntensity
    const p = pathAt(scene.cursorPath, t)
    const [cx, cy] = toCanvas(p.x, p.y)
    // Every treatment goes through the same viewport projection as the pointer itself.
    switch (scene.cursor.effect) {
      case 'pulse':
        drawPulse(ctx, scene, t, toCanvas, size, intensity)
        break
      case 'halo':
        drawHalo(ctx, scene, t, cx, cy, size, intensity)
        break
      case 'spotlight':
        drawSpotlight(ctx, scene, t, toCanvas, size, v, intensity)
        break
      case 'natural':
        break
    }
    drawCursor(ctx, cx, cy, size, pressAt(scene, t))
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

import type { AspectRatio, FrameStyle } from '../project'
import { clamp } from './timeline'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  width: number
  height: number
}

export const ASPECT_RATIOS: Record<AspectRatio, { w: number; h: number; label: string }> = {
  '16:9': { w: 16, h: 9, label: 'Landscape' },
  '9:16': { w: 9, h: 16, label: 'Portrait' },
  '1:1': { w: 1, h: 1, label: 'Square' },
  '4:3': { w: 4, h: 3, label: 'Classic' },
}

/** Output pixel size for an aspect ratio at a given short side. Always even (H.264 needs it). */
export function outputSize(aspect: AspectRatio, shortSide: number): Size {
  const r = ASPECT_RATIOS[aspect]
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  if (r.w >= r.h) return { width: even((shortSide * r.w) / r.h), height: even(shortSide) }
  return { width: even(shortSide), height: even((shortSide * r.h) / r.w) }
}

/** Reference short side that radius/shadow values are authored against. */
export const REFERENCE_SHORT_SIDE = 1080

export interface FrameLayout {
  /** Where the (cropped/zoomed) video is drawn. */
  video: Rect
  radius: number
  shadow: { blur: number; offsetY: number; alpha: number }
  /** Pixels per reference pixel. */
  unit: number
}

/**
 * Places a source of size srcW x srcH inside a canvas, honouring padding and frame scale.
 * Identical for preview (any canvas size) and export — everything is proportional.
 */
export function computeLayout(canvas: Size, srcW: number, srcH: number, frame: FrameStyle): FrameLayout {
  const short = Math.min(canvas.width, canvas.height)
  const unit = short / REFERENCE_SHORT_SIDE
  const pad = clamp(frame.padding, 0, 0.3) * short
  const availW = Math.max(1, canvas.width - pad * 2)
  const availH = Math.max(1, canvas.height - pad * 2)
  const srcAspect = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9
  let w = availW
  let h = w / srcAspect
  if (h > availH) {
    h = availH
    w = h * srcAspect
  }
  const s = clamp(frame.scale, 0.5, 1)
  w *= s
  h *= s
  const video = { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h }
  const radius = clamp(frame.radius * unit, 0, Math.min(w, h) / 2)
  const strength = clamp(frame.shadow, 0, 1)
  return {
    video,
    radius,
    shadow: { blur: 70 * unit * strength, offsetY: 24 * unit * strength, alpha: 0.55 * strength },
    unit,
  }
}

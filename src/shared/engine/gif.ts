import type { Project } from '../project'
import { outputSize } from './layout'

/** GIF size for a project: `gifWidth` wide, keeping the output aspect ratio (even pixels). */
export function gifSize(project: Pick<Project, 'aspectRatio' | 'export'>): { width: number; height: number } {
  const full = outputSize(project.aspectRatio, 1080)
  const width = project.export.gifWidth
  const height = Math.max(2, Math.round((width * full.height) / full.width / 2) * 2)
  return { width, height }
}

/**
 * GIF frame delays in centiseconds with error diffusion, so e.g. 15 fps alternates 7/7/6 cs
 * and the total duration stays exact.
 */
export function gifDelays(count: number, fps: number): number[] {
  const delays: number[] = []
  for (let i = 0; i < count; i++) delays.push(Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps))
  return delays
}

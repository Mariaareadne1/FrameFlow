import type { Background, CursorStyle, FrameStyle, StylePresetId } from './project'

/** A background layer description that both preview and export paint identically. */
export type BackgroundLayer =
  | { type: 'linear'; angle: number; stops: Array<[number, string]> }
  | { type: 'radial'; x: number; y: number; radius: number; color: string }

export interface BackgroundPreset {
  id: string
  name: string
  base: string
  layers: BackgroundLayer[]
}

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    base: '#0b1020',
    layers: [
      { type: 'linear', angle: 135, stops: [[0, '#1d2b64'], [1, '#0b1020']] },
      { type: 'radial', x: 0.15, y: 0.1, radius: 0.9, color: 'rgba(91,124,250,0.55)' },
      { type: 'radial', x: 0.95, y: 0.95, radius: 0.85, color: 'rgba(56,189,248,0.35)' },
    ],
  },
  {
    id: 'dusk',
    name: 'Dusk',
    base: '#1a0f2e',
    layers: [
      { type: 'linear', angle: 160, stops: [[0, '#3a1c71'], [0.55, '#d76d77'], [1, '#ffaf7b']] },
      { type: 'radial', x: 0.2, y: 0.2, radius: 0.8, color: 'rgba(255,255,255,0.12)' },
    ],
  },
  {
    id: 'mint',
    name: 'Mint',
    base: '#0f2a2a',
    layers: [
      { type: 'linear', angle: 135, stops: [[0, '#43cea2'], [1, '#185a9d']] },
      { type: 'radial', x: 0.85, y: 0.15, radius: 0.7, color: 'rgba(255,255,255,0.18)' },
    ],
  },
  {
    id: 'ember',
    name: 'Ember',
    base: '#2a0f0f',
    layers: [
      { type: 'linear', angle: 120, stops: [[0, '#f12711'], [1, '#f5af19']] },
      { type: 'radial', x: 0.1, y: 0.9, radius: 0.8, color: 'rgba(80,0,40,0.35)' },
    ],
  },
  {
    id: 'mist',
    name: 'Mist',
    base: '#e9edf5',
    layers: [
      { type: 'linear', angle: 150, stops: [[0, '#f5f7fb'], [1, '#d9e0ee']] },
      { type: 'radial', x: 0.1, y: 0.05, radius: 0.9, color: 'rgba(170,190,255,0.45)' },
      { type: 'radial', x: 0.95, y: 0.95, radius: 0.7, color: 'rgba(255,200,220,0.35)' },
    ],
  },
  {
    id: 'graphite',
    name: 'Graphite',
    base: '#141518',
    layers: [
      { type: 'linear', angle: 180, stops: [[0, '#26282e'], [1, '#111214']] },
      { type: 'radial', x: 0.5, y: 0, radius: 0.9, color: 'rgba(255,255,255,0.06)' },
    ],
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    base: '#04131f',
    layers: [
      { type: 'linear', angle: 200, stops: [[0, '#00c6ff'], [1, '#0072ff']] },
      { type: 'radial', x: 0.9, y: 0.1, radius: 0.6, color: 'rgba(255,255,255,0.2)' },
      { type: 'radial', x: 0.05, y: 0.95, radius: 0.8, color: 'rgba(10,20,80,0.45)' },
    ],
  },
  {
    id: 'orchid',
    name: 'Orchid',
    base: '#2b0b3a',
    layers: [
      { type: 'linear', angle: 135, stops: [[0, '#8e2de2'], [1, '#4a00e0']] },
      { type: 'radial', x: 0.85, y: 0.85, radius: 0.75, color: 'rgba(255,120,200,0.45)' },
    ],
  },
] as const

export const SOLID_COLORS: readonly string[] = [
  '#0f1115',
  '#1f2430',
  '#f4f4f5',
  '#ffffff',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#059669',
]

export const DEFAULT_PRESET_ID = 'aurora'

export function findBackgroundPreset(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? BACKGROUND_PRESETS[0]!
}

/** Resolves a project background into concrete paint layers. */
export function resolveBackground(bg: Background): BackgroundPreset {
  if (bg.kind === 'solid') {
    return { id: 'solid', name: 'Solid', base: bg.color, layers: [] }
  }
  return findBackgroundPreset(bg.presetId)
}

export interface StylePreset {
  id: StylePresetId
  name: string
  description: string
  background: Background
  frame: FrameStyle
  cursor: Pick<CursorStyle, 'size' | 'smoothing' | 'clickEffect'>
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'clean',
    name: 'Clean',
    description: 'Soft gradient, generous padding',
    background: { kind: 'preset', presetId: 'aurora' },
    frame: { padding: 0.08, radius: 18, shadow: 0.7, scale: 1 },
    cursor: { size: 1.4, smoothing: 0.6, clickEffect: true },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Quiet backdrop, tight framing',
    background: { kind: 'preset', presetId: 'graphite' },
    frame: { padding: 0.045, radius: 12, shadow: 0.45, scale: 1 },
    cursor: { size: 1.2, smoothing: 0.5, clickEffect: false },
  },
  {
    id: 'colorful',
    name: 'Colorful',
    description: 'Vivid gradient, bold shadow',
    background: { kind: 'preset', presetId: 'dusk' },
    frame: { padding: 0.1, radius: 24, shadow: 0.9, scale: 1 },
    cursor: { size: 1.5, smoothing: 0.65, clickEffect: true },
  },
]

export function findStylePreset(id: StylePresetId): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0]!
}

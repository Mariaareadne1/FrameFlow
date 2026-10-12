import type { Background, CursorStyle, FrameStyle, LegacyStyleId, StyleId, StylePresetId } from './project'

/** A background layer description that both preview and export paint identically. */
export type BackgroundLayer =
  | { type: 'linear'; angle: number; stops: Array<[number, string]> }
  /**
   * `soft` fades to the same colour at zero alpha. Without it the gradient fades to
   * transparent black (the 0.1 behaviour, which greys light colours; kept for classic presets).
   */
  | { type: 'radial'; x: number; y: number; radius: number; color: string; soft?: boolean }
  /** Darkens/tints the edges; transparent in the centre. */
  | { type: 'vignette'; color: string; inner: number; outer: number }
  /** Deterministic film/paper grain from a seeded generator (never random per frame). */
  | { type: 'grain'; amount: number; seed: number }

export interface BackgroundPreset {
  id: string
  name: string
  base: string
  layers: BackgroundLayer[]
  /** 'signature' presets belong to the 2.0 styles; 'classic' are the 0.1 gradients. */
  group?: 'signature' | 'classic'
}

export const SIGNATURE_BACKGROUNDS: readonly BackgroundPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    group: 'signature',
    base: '#E6E7EA',
    layers: [
      { type: 'linear', angle: 165, stops: [[0, '#F3F4F6'], [1, '#D9DBE0']] },
      { type: 'radial', x: 0.18, y: 0.08, radius: 0.75, soft: true, color: 'rgba(255,255,255,0.55)' },
    ],
  },
  {
    id: 'ivory',
    name: 'Ivory',
    group: 'signature',
    base: '#F2ECE1',
    layers: [
      { type: 'linear', angle: 172, stops: [[0, '#F8F4EC'], [1, '#EBE2D3']] },
      { type: 'radial', x: 0.5, y: -0.05, radius: 0.85, soft: true, color: 'rgba(255,253,248,0.7)' },
      { type: 'vignette', color: 'rgba(150,120,85,0.10)', inner: 0.35, outer: 0.78 },
    ],
  },
  {
    id: 'aura',
    name: 'Aura',
    group: 'signature',
    base: '#ECE6F4',
    layers: [
      { type: 'radial', x: 0.12, y: 0.18, radius: 0.72, soft: true, color: 'rgba(170,154,207,0.85)' },
      { type: 'radial', x: 0.9, y: 0.2, radius: 0.62, soft: true, color: 'rgba(141,178,236,0.62)' },
      { type: 'radial', x: 0.78, y: 0.95, radius: 0.7, soft: true, color: 'rgba(231,169,154,0.72)' },
      { type: 'radial', x: 0.18, y: 0.98, radius: 0.55, soft: true, color: 'rgba(236,170,206,0.55)' },
      { type: 'radial', x: 0.5, y: 0.5, radius: 0.45, soft: true, color: 'rgba(255,255,255,0.28)' },
    ],
  },
  {
    id: 'paper',
    name: 'Paper',
    group: 'signature',
    base: '#E6D8BD',
    layers: [
      { type: 'linear', angle: 175, stops: [[0, '#EEE3CC'], [1, '#DDCBA8']] },
      { type: 'radial', x: 0.3, y: 0.15, radius: 0.7, soft: true, color: 'rgba(250,244,230,0.55)' },
      { type: 'vignette', color: 'rgba(110,80,40,0.16)', inner: 0.38, outer: 0.88 },
      { type: 'grain', amount: 0.1, seed: 7 },
    ],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    group: 'signature',
    base: '#0F1116',
    layers: [
      { type: 'linear', angle: 160, stops: [[0, '#1B1E28'], [1, '#0B0C11']] },
      { type: 'radial', x: 0.5, y: 0.42, radius: 0.55, soft: true, color: 'rgba(170,154,207,0.17)' },
      { type: 'vignette', color: 'rgba(0,0,0,0.38)', inner: 0.4, outer: 0.9 },
    ],
  },
]

/** The eight 0.1 gradients, kept so older projects render unchanged and as palette options. */
export const CLASSIC_BACKGROUNDS: readonly BackgroundPreset[] = [
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
]

export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [...SIGNATURE_BACKGROUNDS, ...CLASSIC_BACKGROUNDS.map((p) => ({ ...p, group: 'classic' as const }))]

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

/** A 2.0 art direction: a curated backdrop and frame. Camera and cursor are independent. */
export interface StylePreset {
  id: StyleId
  name: string
  description: string
  background: Background
  frame: FrameStyle
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Warm ivory, soft warm shadow',
    background: { kind: 'preset', presetId: 'ivory' },
    frame: { padding: 0.095, radius: 18, shadow: 0.62, scale: 1, shadowTint: '#5C4630' },
  },
  {
    id: 'studio',
    name: 'Studio',
    description: 'Neutral and professional',
    background: { kind: 'preset', presetId: 'studio' },
    frame: { padding: 0.075, radius: 14, shadow: 0.55, scale: 1, shadowTint: '#1E2430' },
  },
  {
    id: 'aura',
    name: 'Aura',
    description: 'Luminous colour, quiet frame',
    background: { kind: 'preset', presetId: 'aura' },
    frame: { padding: 0.085, radius: 20, shadow: 0.5, scale: 1, shadowTint: '#3B325F' },
  },
  {
    id: 'canvas',
    name: 'Canvas',
    description: 'Paper grain, matte contact shadow',
    background: { kind: 'preset', presetId: 'paper' },
    frame: { padding: 0.09, radius: 10, shadow: 0.42, scale: 1, shadowTint: '#4A3824' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Cinematic dark, gentle glow',
    background: { kind: 'preset', presetId: 'midnight' },
    frame: { padding: 0.07, radius: 14, shadow: 0.55, scale: 1, shadowTint: '#5E4E96' },
  },
]

export const DEFAULT_STYLE: StyleId = 'editorial'

/** 0.1 presets. Only used to create legacy-identical projects in tests and to name old styles. */
export interface LegacyStylePreset {
  id: LegacyStyleId
  name: string
  background: Background
  frame: FrameStyle
  cursor: Pick<CursorStyle, 'size' | 'smoothing' | 'clickEffect'>
}

export const LEGACY_STYLE_PRESETS: readonly LegacyStylePreset[] = [
  { id: 'clean', name: 'Clean', background: { kind: 'preset', presetId: 'aurora' }, frame: { padding: 0.08, radius: 18, shadow: 0.7, scale: 1 }, cursor: { size: 1.4, smoothing: 0.6, clickEffect: true } },
  { id: 'minimal', name: 'Minimal', background: { kind: 'preset', presetId: 'graphite' }, frame: { padding: 0.045, radius: 12, shadow: 0.45, scale: 1 }, cursor: { size: 1.2, smoothing: 0.5, clickEffect: false } },
  { id: 'colorful', name: 'Colorful', background: { kind: 'preset', presetId: 'dusk' }, frame: { padding: 0.1, radius: 24, shadow: 0.9, scale: 1 }, cursor: { size: 1.5, smoothing: 0.65, clickEffect: true } },
]

export function findStylePreset(id: StylePresetId): StylePreset | null {
  return STYLE_PRESETS.find((p) => p.id === id) ?? null
}

export function styleName(id: StylePresetId): string {
  return findStylePreset(id)?.name ?? LEGACY_STYLE_PRESETS.find((p) => p.id === id)?.name ?? 'Custom'
}

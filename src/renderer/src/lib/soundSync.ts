import type { SoundSettings } from '@shared/project'

/** Larger drift than this between a track and the video triggers a resync. */
const MAX_DRIFT = 0.12

/**
 * Plays a project's extra audio tracks alongside the preview video. Everything is routed
 * through Web Audio gain nodes, so preview levels (including >100%) match the exported mix.
 */
export class SoundSync {
  private ctx: AudioContext | null = null
  private mainGain: GainNode | null = null
  private tracks = new Map<string, { el: HTMLAudioElement; path: string; gain: GainNode | null; level: number }>()
  private mainLevel = 1

  constructor(private readonly video: HTMLVideoElement) {}

  /** Creates the audio graph lazily (on first play, after a user gesture). */
  private ensureGraph(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      const ctx = new AudioContext()
      const src = ctx.createMediaElementSource(this.video)
      const g = ctx.createGain()
      g.gain.value = this.mainLevel
      src.connect(g).connect(ctx.destination)
      this.ctx = ctx
      this.mainGain = g
      for (const t of this.tracks.values()) this.attach(t)
      return ctx
    } catch {
      // Without Web Audio, fall back to element volume (capped at 100%).
      this.video.volume = Math.min(1, this.mainLevel)
      return null
    }
  }

  private attach(t: { el: HTMLAudioElement; gain: GainNode | null; level: number }): void {
    if (!this.ctx || t.gain) return
    const src = this.ctx.createMediaElementSource(t.el)
    t.gain = this.ctx.createGain()
    t.gain.gain.value = t.level
    src.connect(t.gain).connect(this.ctx.destination)
  }

  /** Reconciles audio elements and levels with the project's sound settings. */
  update(sound: SoundSettings, urlFor: (path: string) => string): void {
    this.mainLevel = sound.mainGain
    if (this.mainGain) this.mainGain.gain.value = sound.mainGain
    else this.video.volume = Math.min(1, sound.mainGain)
    const wanted = new Set(sound.tracks.map((t) => t.id))
    for (const [id, t] of this.tracks) {
      if (!wanted.has(id)) {
        t.el.pause()
        t.el.removeAttribute('src')
        t.el.load()
        t.gain?.disconnect()
        this.tracks.delete(id)
      }
    }
    for (const track of sound.tracks) {
      let t = this.tracks.get(track.id)
      if (t && t.path !== track.path) {
        t.el.src = urlFor(track.path)
        t.path = track.path
      }
      if (!t) {
        const el = new Audio()
        el.crossOrigin = 'anonymous'
        el.preload = 'auto'
        el.src = urlFor(track.path)
        t = { el, path: track.path, gain: null, level: track.gain }
        this.tracks.set(track.id, t)
        this.attach(t)
      }
      t.level = track.gain
      if (t.gain) t.gain.gain.value = track.gain
      else t.el.volume = Math.min(1, track.gain)
    }
  }

  play(t: number): void {
    const ctx = this.ensureGraph()
    void ctx?.resume()
    for (const tr of this.tracks.values()) {
      tr.el.currentTime = t
      if (t < (tr.el.duration || Infinity)) void tr.el.play().catch(() => undefined)
    }
  }

  pause(): void {
    for (const tr of this.tracks.values()) tr.el.pause()
  }

  seek(t: number): void {
    for (const tr of this.tracks.values()) tr.el.currentTime = t
  }

  /** Called every animation frame while playing. */
  keepInSync(t: number): void {
    for (const tr of this.tracks.values()) {
      const end = tr.el.duration || Infinity
      if (t >= end) continue
      if (Math.abs(tr.el.currentTime - t) > MAX_DRIFT) tr.el.currentTime = t
      if (tr.el.paused) void tr.el.play().catch(() => undefined)
    }
  }

  dispose(): void {
    this.pause()
    for (const t of this.tracks.values()) {
      t.el.removeAttribute('src')
      t.el.load()
    }
    this.tracks.clear()
    void this.ctx?.close()
    this.ctx = null
  }
}

import { create } from 'zustand'

/** Playback position lives in its own tiny store so ticking does not re-render the editor. */
export interface PlayheadState {
  time: number
  playing: boolean
  set(patch: Partial<Pick<PlayheadState, 'time' | 'playing'>>): void
}

export const usePlayhead = create<PlayheadState>((set) => ({
  time: 0,
  playing: false,
  set: (patch) => set(patch),
}))

/** Imperative controls registered by the active preview. */
export interface PlaybackControls {
  play(): void
  pause(): void
  toggle(): void
  seek(sourceTime: number): void
}

let controls: PlaybackControls | null = null
let sourceVideo: HTMLVideoElement | null = null
export const playback = {
  register(c: PlaybackControls | null) {
    controls = c
  },
  setVideo(v: HTMLVideoElement | null) {
    sourceVideo = v
  },
  /** The raw source video element (unzoomed pixels), for tools like the focus picker. */
  video: () => sourceVideo,
  play: () => controls?.play(),
  pause: () => controls?.pause(),
  toggle: () => controls?.toggle(),
  seek: (t: number) => controls?.seek(t),
}

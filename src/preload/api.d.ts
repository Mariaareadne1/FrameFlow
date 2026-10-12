import type { FrameFlowAPI } from '../shared/ipc'

declare global {
  interface Window {
    frameflow: FrameFlowAPI
  }
}

export {}

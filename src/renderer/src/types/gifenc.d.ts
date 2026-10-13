// Minimal types for gifenc (MIT, https://github.com/mattdesl/gifenc).
declare module 'gifenc' {
  export type Palette = number[][]
  export interface GifStream {
    reset(): void
  }
  export interface GifEncoderInstance {
    writeHeader(): void
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number; repeat?: number; first?: boolean; dispose?: number }): void
    finish(): void
    bytesView(): Uint8Array
    readonly stream: GifStream
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
}

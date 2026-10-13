# Third-Party Notices

FrameFlow itself is released under the MIT License (see `LICENSE`).

## Bundled in the application

| Component | Version | License | Use |
|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 40.x | MIT | Desktop runtime. Chromium and its dependencies' licenses ship inside the app (`LICENSES.chromium.html`). |
| [React](https://github.com/facebook/react) / react-dom / scheduler | 19.x | MIT | User interface |
| [zustand](https://github.com/pmndrs/zustand) | 5.x | MIT | State management |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | 1.61.x | MPL-2.0 | Demuxing, decoding, encoding and MP4 muxing (via WebCodecs). Used unmodified; source is available at the link. |
| [gifenc](https://github.com/mattdesl/gifenc) | 1.0.x | MIT | GIF encoding and palette quantisation |
| [lucide-react](https://github.com/lucide-icons/lucide) | 1.x | ISC | Icons |
| [clsx](https://github.com/lukeed/clsx) | 2.x | MIT | Class names |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 4.x | MIT | Generated stylesheet |
| [Inter](https://github.com/rsms/inter) via `@fontsource-variable/inter` | 4.x / 5.x | SIL OFL 1.1 | Interface typeface (bundled, offline) |
| [Instrument Serif](https://github.com/Instrument/instrument-serif) via `@fontsource/instrument-serif` | 5.x | SIL OFL 1.1 | Display typeface (bundled, offline) |

The native capture helper uses only Apple system frameworks (ScreenCaptureKit, AVFoundation,
AppKit, CoreMedia).

## Development and test tools (not shipped)

| Component | License | Use |
|---|---|---|
| ffmpeg-static (FFmpeg binary) | GPL-3.0-or-later | Generating synthetic test videos and decoding exports in tests |
| ffprobe-static | MIT (wraps FFmpeg, LGPL/GPL) | Inspecting test outputs |
| Playwright, Vitest, Vite, electron-vite, electron-builder, TypeScript, ESLint | Apache-2.0 / MIT | Build and test |

## Reference

The product was designed after studying [OpenScreen](https://github.com/siddharthvaddem/openscreen)
(MIT, © 2025 Siddharth Vaddem) and its community fork
[EtienneLescot/openscreen](https://github.com/EtienneLescot/openscreen) (MIT). No source code,
assets or branding from those projects are included in FrameFlow.

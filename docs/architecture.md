# FrameFlow Architecture

> Updated for **FrameFlow 2.0**. The 2.0 product redesign is described in
> [redesign.md](redesign.md); this document covers the system it is built on.

FrameFlow is a macOS desktop app that turns a raw screen recording into a polished demo:
it hides the real cursor while recording, records cursor/click telemetry, generates
automatic zooms, and renders everything over a styled backdrop to an H.264 MP4.

```
┌──────────────────────────── Electron main (Node) ────────────────────────────┐
│ index.ts      lifecycle, menu, permission handlers, single instance           │
│ windows.ts    main window + recording HUD (sandboxed, hardened navigation)    │
│ ipc.ts        typed IPC handlers, argument validation                         │
│ access.ts     allow-lists: readable media, export destinations, projects     │
│ capture.ts    spawns the native helper, countdown, HUD, stop/cancel/quit     │
│ mediaProtocol ffmedia:// with HTTP Range (video element streaming)           │
│ fileHandles   random-access reads (demuxer) + atomic export writes            │
│ projects.ts   .frameflow load/save (validated), recents, library folders      │
└───────────────┬───────────────────────────────────────────────┬──────────────┘
      stdin/stdout JSON lines                           contextBridge (preload)
┌───────────────┴──────────────┐          ┌─────────────────────┴──────────────┐
│ FrameFlowCapture (Swift)     │          │ Renderer (React, sandboxed)         │
│ ScreenCaptureKit stream      │          │ screens: Home (gallery), Record,    │
│  showsCursor = false         │          │   Studio (Moments·Design·Camera·    │
│ AVAssetWriter → H.264 MP4    │          │   Cursor·Timeline), HUD             │
│ 60 Hz cursor + click sampler │          │ state: editorStore (undo/redo),     │
│                              │          │   playhead, studioStore, appStore   │
│ → recording.mp4, cursor.json │          │ engine/render.ts  ← shared by       │
└──────────────────────────────┘          │   Preview (rAF)  and  exporter.ts   │
                                          │ media/: mediabunny demux/decode,    │
                                          │   WebCodecs H.264 encode, MP4 mux   │
                                          └─────────────────────────────────────┘
                  src/shared/  — pure TypeScript used by everything (and unit tests)
                  project.ts · projectModel.ts (+ v1→v2 migration) · styles.ts · moments.ts · ipc.ts
                  engine/ timeline · cursor · camera · autoZoom · layout
```

## One project model, one Studio

`src/shared/project.ts` defines the single `Project` representation (format v2). The
**Studio** is one screen whose sections — Moments, Design, Camera, Cursor and Timeline — are
all views over the same object in the same store (`editorStore`). The preview stays mounted
across sections; `project.mode` only remembers whether the Timeline was last open.

- **Moments are `ZoomEvent`s.** `src/shared/moments.ts` derives the card view (numbering,
  honest "Click at / Focus at" subtitles, output times after cuts, status) from
  `project.zooms`, recorded clicks and trims — nothing is stored twice. Optional
  `ZoomEvent.label` and `ZoomEvent.disabled` hold user names and "camera off".
- Automatic zoom produces ordinary `ZoomEvent`s with `origin: 'auto'`. Editing one (from a
  Moment card or the Timeline) promotes it to `origin: 'manual'`, so changing the camera feel
  regenerates only untouched automatic Moments. Regeneration never mints duplicate ids and
  drops autos that a manual Moment overlaps (they would be suppressed when rendering anyway).
- Styles (Studio, Editorial, Aura, Canvas, Midnight) map to `background` + `frame` only;
  camera (`project.camera`) and cursor (`project.cursor`) are independent settings.
- Every UI path, from the Moments strip to the Timeline, goes through the same `projectModel`
  operations and one export pipeline.

### Conventions
- **Time** stored in a project (zooms, trims, cursor samples) is *source* seconds. Trims are
  removed ranges; `engine/timeline.ts` maps between source and output time. Zooms and cursor
  data therefore never drift when cuts are added.
- **Space**: cursor positions and zoom focus are normalized to the source frame `[0,1]²`.

## Recording pipeline (macOS)

`native/macos/FrameFlowCapture.swift`, built by `scripts/build-native.mjs` (universal
arm64/x86_64, macOS 14+, ad-hoc signed) and shipped in `Resources/bin`.

1. Main spawns `FrameFlowCapture record --out-dir … --display ID | --window ID --fps 60
   --exclude-pid <app pid> [--mic]`.
2. `SCContentFilter` captures a display (excluding FrameFlow's own windows, including the HUD)
   or a single window. `showsCursor = false` — the system cursor is **not** in the pixels, so
   the rendered cursor never duplicates it.
3. Frames go to `AVAssetWriter` (H.264 High, ~0.12 bits/pixel/frame, 60000 timescale,
   2 s fragments so a crash still leaves a playable file). Bursty frames closer than half a frame
   interval are dropped; an idle tail is preserved by re-appending the last frame at stop time.
4. A 60 Hz timer samples `NSEvent.mouseLocation` (converted to top-left global coordinates
   and normalized against the captured display/window bounds, refreshed at 10 Hz for windows).
   Clicks come from a global mouse-down monitor (no Accessibility permission needed) with a
   polling fallback. All timestamps use the host clock, the same clock as the video sample
   buffers, and are rebased to the first video frame when written to `cursor.json`.
5. Stop arrives as `stop` on stdin, stdin EOF (app quit/crash), SIGINT or SIGTERM. The writer is
   always finalized; the app waits up to 6 s on quit so recordings are never lost.

Microphone capture uses ScreenCaptureKit's microphone output (macOS 15+) into an AAC track.

**Synthetic source.** With `FRAMEFLOW_CAPTURE_SYNTHETIC=1` the helper renders a moving test
pattern and scripted cursor instead of capturing the screen, through the *same* writer,
telemetry and process protocol. E2E tests use it so the full recording workflow is testable
without Screen Recording permission. Real capture is covered separately (see testing.md).

## Sound (2.1)

- **Capture.** `--system-audio` turns on ScreenCaptureKit audio (48 kHz stereo, excluding
  FrameFlow's own process). Display recordings use the main stream's audio. Window
  recordings add an audio-only display stream: a window filter only hears that window's
  process, and Chromium and Electron apps play sound from helper processes. The microphone
  goes into the recording's AAC track when it is the only source. With system audio on, it
  goes to `microphone.m4a`, an `AudioFileWriter` whose session starts at the first video
  frame, so both files share a time origin.
- **Model.** `project.sound = { mainGain, tracks[] }`. A track is `{ kind:
  microphone|imported, label, path, gain }`. Tracks start at source time 0 and are cut with
  the video. Format v3; v1 and v2 load with `{ mainGain: 1, tracks: [] }`.
- **Preview.** `lib/soundSync.ts` routes the video element and one `<audio>` per track
  through Web Audio gain nodes, which allows levels above 100%. It keeps tracks within 0.12 s
  of the video and follows play, pause, seek and cut jumps.
- **Export.** With no tracks and `mainGain` 1, the kept sections are copied sample-exactly
  (the 2.0 path). Otherwise `media/audioMix.ts` decodes every source one second at a time
  over the kept segments. It resamples and up-mixes to 48 kHz stereo, applies gains, sums
  with a soft limiter, and encodes AAC. Memory use stays bounded.
- **Trust.** Track paths in a project file are untrusted, like the video path. They must be
  audio files and pass the same location rules, otherwise they are dropped from the opened
  copy. Saving requires every track path to be granted.

## Rendering — one function for preview and export

`src/renderer/src/engine/render.ts → renderFrame(ctx, size, scene, source, t)` draws one
output frame with Canvas 2D:

1. cached backdrop: background layers (linear, radial, vignette and deterministic seeded
   grain — `mulberry32`, scaled to the output's short side so it reads the same at any size)
   plus a soft drop shadow and contact shadow, tinted by `frame.shadowTint`,
2. rounded-rect clip,
3. `drawImage` of the camera **viewport** of the source (zoom = cropping the source, so zooms
   are rendered from full-resolution pixels, never upscaled from the output),
4. the cursor treatment (Natural; Halo disc; Spotlight radial quieting after clicks; Pulse
   ripple — identical to 0.1's ripple at full intensity) and the vector cursor, all positioned
   via the same viewport projection,
5. a hairline edge.

All sizes are proportional to the output's short side (`engine/layout.ts`), so a 960×540
preview and a 3840×2160 export frame are geometrically identical. The preview draws the
`<video>` element every animation frame (so cursor and zoom animate even when the screen was
static and the recording has no new frames); the exporter draws decoded `VideoFrame`s.

### Determinism
Smoothing is the usual source of preview/export drift (OpenScreen steps a stateful spring per
frame). FrameFlow instead **precomputes** paths at 120 Hz with a critically damped
"smooth damp" filter (`engine/cursor.ts`): one lightly smoothed path for the visible cursor
and a lazier one (0.45 s) for the camera. Position at time *t* is a lookup, so seeking,
scrubbing, preview and export always agree.

### Camera and zoom (`engine/camera.ts`)
- Per zoom: weight ramps 0→1 over `transition` (≤ half the event) with the chosen easing
  (`smooth` cubic in-out, `crisp` cubic-bezier(.32,0,.12,1) — quick arrival with zero start
  velocity, `linear`; `snappy`, the 0.1 exponential ease-out, is kept for old projects).
- Zooms within 0.8 s of each other form a **chain**: one envelope ramps in at the first and
  out at the last, and the camera eases scale and focus from one member to the next — a pan
  instead of an out-and-back-in bounce. Hand-offs last at least 0.7 s so distant pans never
  whip across the frame.
- `scale = 1 + (S − 1)·w`, `centre = 0.5 + (focus − 0.5)·w`, then the centre is clamped to
  `[0.5/scale, 1 − 0.5/scale]` so the viewport never leaves the frame.
- Manual zooms win: an automatic zoom overlapping a manual one is ignored.
- Focus is either a fixed point or the camera path (follow cursor). The camera path is built
  with a **dead zone** (`buildCameraPath`): the target only moves once the cursor strays more
  than `camera.deadzone` from it, so small hand movements never move the camera; its smoothing
  time comes from `camera.followSmoothing`. Dead zone 0 reproduces 0.1 exactly.

### Automatic zoom (`engine/autoZoom.ts`)
1. Interest points: left clicks (weight 1) and dwells — the cursor coming to rest (within
   1.5% for ≥ 0.7 s Dynamic / 1.4 s Subtle) after travelling ≥ 6% from the previous dwell.
   Subtle uses dwells only when a recording has no clicks.
2. Cluster points that are close in time **and** fit within 75% of the zoomed viewport.
3. Each cluster → zoom from `first − leadIn` to `last + hold`, at least `minDuration`.
4. Neighbours in the same area merge; neighbours in different areas are split at the midpoint
   and chained (pans), or the weaker is dropped if the split would be under 1.6 s.
5. At most 5 (Subtle) / 9 (Dynamic) zoom starts in any 60 s window, keeping the strongest.

| | Calm (= 0.1 Subtle) | Follow | Focus |
|---|---|---|---|
| Scale | 1.5× | 1.8× | 2.2× |
| Focus | fixed cluster centre | follows cursor (dead-zoned) | fixed cluster centre |
| Interest points | clicks (dwells only without clicks) | clicks + dwells | clicks (dwells only without clicks) |
| Lead-in / hold | 0.7 s / 1.6 s | 0.6 s / 1.5 s | 0.4 s / 1.2 s |
| Transition / easing | 0.9 s smooth | 0.8 s smooth | 0.7 s crisp |
| Max per minute | 5 | 7 | 8 |

**Still** generates nothing. Camera tuning scales these: intensity multiplies magnification,
speed divides transition length, softness picks smooth vs crisp easing.

Imported videos have no telemetry: automatic zoom is unavailable, manual zooms use a fixed
focus point, and the synthetic cursor is disabled (the real cursor is in the pixels).

## Export (`src/renderer/src/media/exporter.ts`)

1. `Input` over a `StreamSource` that reads byte ranges from the main process (nothing is
   loaded whole into memory).
2. Frame plan: `round(outputDuration × fps)` frames; frame *i* shows source time
   `outputToSource((i + 0.5)/fps)`, so frames sample the middle of their interval.
3. `VideoSampleSink.samplesAtTimestamps` decodes sequentially; each frame is rendered by
   `renderFrame` into an `OffscreenCanvas` and encoded by WebCodecs (`CanvasSource`, H.264,
   ~0.09 bits/pixel/frame "High", 2 s keyframes).
4. Audio (if present): kept segments are decoded, trimmed at sample precision, re-timestamped
   onto the output timeline and encoded to AAC.
5. `Mp4OutputFormat` writes through a `StreamTarget` into `<dest>.partial` via IPC. Only after
   finalization is it renamed to the chosen path. Cancelled or failed exports delete the
   partial file; the project is never modified by exporting.

## Projects

A project is a pretty-printed JSON `.frameflow` file (format **v2**). v1 files (0.1) are
migrated in memory by `parseProject` — `autoZoom` → `camera.feel` (off→still, subtle→calm,
dynamic→follow) with legacy tuning (dead zone 0, 0.45 s follow), `clickEffect` →
`cursor.effect` (pulse/natural) — without regenerating zooms or touching any stored value, so
legacy exports are pixel-identical to 0.1 (verified against golden frames). The first save
over a v1 file keeps a `<file>.v1.bak`. Newer formats are refused with a clear message. Recordings live in
`~/Movies/FrameFlow/Recording <date>/` together with `recording.mp4`, `cursor.json` and the
project file; imports get their own folder that references the original video. Saves are
atomic (write temp + rename), happen ~0.7 s after each edit, and are validated with
`parseProject` both when saving and loading. Loading clamps every value, drops invalid zooms
or trims, rejects newer format versions with a clear message, and detects missing media
(the editor offers **Locate Video…**, which checks the duration matches).

## Security model
- Renderer: `sandbox`, `contextIsolation`, no Node integration, strict CSP, all browser
  permission requests denied (capture happens in the native helper), navigation and
  `window.open` blocked.
- The preload exposes a typed, minimal API. Every IPC argument is validated in main.
- File access is allow-listed: the renderer can only read files the user picked, recordings
  FrameFlow made, or media referenced by a project the user opened; exports can only be
  written to paths returned by the save dialog and only as `.mp4`.
- No network access, analytics or accounts. Recordings never leave the machine.

## Research notes: OpenScreen

FrameFlow was designed after studying [OpenScreen](https://github.com/siddharthvaddem/openscreen)
(MIT, archived after v1.5.0) and its community fork
[EtienneLescot/openscreen](https://github.com/EtienneLescot/openscreen). No code or
branding was copied; the notes below informed independent implementation choices.

| Area | OpenScreen | FrameFlow decision |
|---|---|---|
| Capture | ScreenCaptureKit helper (`showsCursor` off in "editable overlay" mode) with a Chromium `getUserMedia` fallback that cannot hide the cursor on macOS | ScreenCaptureKit only on macOS; cursor always hidden, so no duplicate-cursor ambiguity |
| Cursor telemetry | Helper reports clicks; positions from Electron `screen.getCursorScreenPoint()` at ~30 Hz, timed from an epoch start | Helper samples position and clicks itself at 60 Hz on the video's host clock |
| Auto zoom | Dwell detection only (clicks unused), fixed depth ×1.8, duration max(1 s, 5% of video) | Clicks + dwells, spatial clustering, chaining, per-minute cap, two intensities |
| Smoothing | Stateful follow + spring stepped per frame, reset on seek | Precomputed critically damped paths; pure function of time |
| Rendering | PixiJS + CSS in preview; Pixi + 2D canvas + CSS-equivalent filters in export | One Canvas 2D `renderFrame` for both |
| Export | WebCodecs encode; MP4 muxed **in memory** then sent over IPC | Streamed to disk in chunks, atomic rename |
| Recording format | WebM via MediaRecorder needing duration patching, or MP4 from the helper | MP4 (H.264) from the helper, fragmented while recording |
| Projects | JSON `.openscreen`, normalized on load | JSON `.frameflow`, validated on load **and** save |

Known OpenScreen limitations noted during research (from code and the fork's roadmap):
`webSecurity: false` in the editor window, telemetry capped at one hour, export frame rate
hard-coded to 60, auto-zooms triggered while dragging, and long macOS takes being truncated.

## Licenses
FrameFlow is MIT licensed. Third-party components are listed in `THIRD-PARTY-NOTICES.md`.
Notably mediabunny is MPL-2.0 (used unmodified as a library) — no FFmpeg is shipped; FFmpeg
static binaries are dev-only test tools.

# Testing FrameFlow

## Quick reference

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc` over main/preload/shared, renderer, and tests |
| `npm run lint` | ESLint (TypeScript, React hooks) |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run fixtures` | Generates synthetic test media into `test-fixtures/` (git-ignored) |
| `npm run test:e2e` | Builds the app, then runs Playwright Electron tests (`tests/e2e`) |
| `npm run package` then `npx playwright test 07` | Smoke-tests the packaged `.app` |
| `FRAMEFLOW_REAL_CAPTURE=1 npx playwright test 05` | Real ScreenCaptureKit capture (opt-in) |
| `FRAMEFLOW_SCREENSHOTS=1 npx playwright test 08` | Visual-QA screenshots → `tests/.artifacts/look` (`=docs` → `docs/media`) |
| `FRAMEFLOW_CAPTURE_GOLDEN=1 npx playwright test --config tests/legacy-golden/playwright.config.ts` | Re-captures 0.1 golden frames (only meaningful on a 0.1 build) |

Run `npm run fixtures` once before the end-to-end tests.

## Test media

`scripts/generate-fixtures.ts` uses the dev-only `ffmpeg-static` binary to make
deterministic "screen recordings" of a mock app UI. Each one has text labels, a moving
block, and a **burned-in time code**: two 80×80 patches in the top-left corner whose
luminance encodes the source time (`20 + digit × 22`, seconds and tenths). Reading those
patches back from an exported frame shows exactly which source moment that frame came from,
which is how trims and timestamp drift are verified.

| Fixture | Size | Length | Notes |
|---|---|---|---|
| `demo-1920x1200` | 1920×1200 @60 | 30 s | + `demo-1920x1200.cursor.json` (scripted cursor with clicks) |
| `short-1280x720` | 1280×720 @30 | 1.5 s | very short clip |
| `portrait-1080x1920` | 1080×1920 @30 | 6 s | portrait source |
| `tone-1280x800` | 1280×800 @30 | 8 s | 440 Hz AAC audio |
| `long-1920x1200` | 1920×1200 @60 | 5 min | audio + cursor; performance test |

Cursor telemetry comes from `tests/support/synthetic.ts`. It moves the cursor between
scripted targets with human-like easing and clicks on arrival; the timestamps and
coordinates are known exactly.

## Recording without permissions: the synthetic capture source

With `FRAMEFLOW_CAPTURE_SYNTHETIC=1`, the native helper replaces ScreenCaptureKit with a
generated test pattern and a scripted cursor, but keeps the same writer, telemetry, process
protocol and stop handling. The app, HUD, countdown, cancel, quit-during-recording and
project creation all run for real. This makes the full Quick Demo workflow testable in CI and
on machines without Screen Recording permission.

## Real capture

`tests/e2e/05-real-capture.spec.ts` (opt-in) needs the Screen Recording permission for the
process running the tests. It opens a local interactive demo page (`tests/demo-app`) in its
own window and records **only that window** through FrameFlow's real capture path. While
recording it moves the real mouse pointer for a few seconds (`CGWarpMouseCursorPosition`,
which does not click) and drives the page with Playwright. It then checks:

- the recording's codec and resolution (Retina pixels),
- that the content changed during the recording,
- that the cursor telemetry is dense and normalized to the window,
- that automatic zooms were generated,
- that an export succeeds.

## End-to-end specs

| Spec | Covers |
|---|---|
| 01 import-export | launch, import, play/pause/seek, 1080p60 export |
| 02 quick-demo | synthetic recording → Studio with automatic Moments → export without the Timeline → Still vs Calm pixels → Aura/9:16 export → Timeline shows the same Moments → edit → undo/redo → relaunch + reopen |
| 03 editing | background/padding preview pixels, cuts verified by time code, manual Moments on a video without telemetry, drag/delete/undo, square export; very short clip, portrait source, AAC through a cut |
| 04 robustness | permission denied, missing-media relink, export cancel/unwritable, discard, quit mid-recording, crafted project trust boundary |
| 05 real-capture (opt-in) | real ScreenCaptureKit window capture of a local demo page |
| 06 long-recording | 5-minute recording open/edit/export memory + speed; 60-project gallery |
| 07 packaged-app | the built `.app` records via its bundled helper and exports; no DevTools |
| 09 moments | thumbnails decoded and matched to each Moment's time code, seek on select, rename/zoom edits become manual, feel changes keep edits, disable/delete/undo/redo/add, cuts keep source time, cut-out Moments, Timeline drag ↔ Moment sync, export |
| 10 creative | all five styles exported (720p30) with backdrop colour/grain checks; custom padding across 9:16 and 1:1; Still/Calm/Follow/Focus exports checked against the shared camera engine at 19 instants; Natural/Halo/Spotlight/Pulse checked around a click; **preview vs export parity** |
| 12 sound | synthetic recording with system audio (440 Hz) and microphone (660 Hz): default mix, mic muted, system muted, imported 880 Hz track plus a cut, reopen. A silent video gains a voice-over, cut to the video length. Audio is analysed per frequency band in the exported MP4. |
| 13 real-system-audio (opt-in) | real window capture with system audio while the demo page plays a quiet 523 Hz tone. The tone must be in the recording and the export. |
| 14 gif | Aura + Focus + Pulse with cuts, exported as GIF: codec gif, 720×406, exactly 75 frames over 5.00 s, loop marker, clean decode, frames within 10/255 of the MP4 at three times, and cancel cleans up |
| 15 annotations | caption + arrow added in the inspector: caption pill present only during the Moment, coral arrow at the tip predicted by the shared camera engine while zoomed, caption kept with camera off, note survives reopen |
| 11 legacy-projects | three real 0.1 projects: open unchanged, export compared with frames exported by 0.1, edit → saved as v2 with `.v1.bak`, reopen |

## How exports are verified

`tests/support/media.ts` wraps ffprobe and ffmpeg:

- `probe()` returns codec, profile, resolution, average fps, duration, counted frames and
  audio codec.
- `decodeErrors()` fully decodes the file. It uses passthrough timing and the input
  timebase, so variable-frame-rate recordings are not misreported. It returns any decoder
  error.
- `frameAt()` decodes a single frame to RGB for pixel checks.
- `frameDiff()`, `meanLuma()`, `blackFraction()` and `readTimecode()` support those checks.

The exports are asserted as follows:

- **Correctness:** H.264, exact output size per aspect ratio, exact frame count
  (`duration × fps`), duration within 0.1 s, no decoder errors, and no black frames.
- **Trims:** the time code read at output times on both sides of a cut must match the
  expected source time to within 0.15 s.
- **Zooms:** a Quick Demo export is compared against the same project with auto zoom Off.
  Frames differ strongly where the camera is zoomed and match before any zoom starts.
  Editing an automatic zoom changes the frames at that zoom.
- **Styling:** background colors and the video's position are checked against the shared
  layout function (`computeLayout`).
- **Preview:** the preview canvas pixels change immediately when the background or padding
  changes.
- **Parity:** the preview canvas is read back (PNG) and compared with the exported frame at
  the same output time — mean absolute difference must stay under 6/255 (encoding noise).
- **Legacy:** exported frames of migrated 0.1 projects are compared with golden frames
  exported by 0.1 itself (`tests/fixtures/legacy/golden`), threshold 2.5/255.
- **Camera:** for every feel, the saved project is fed to the shared engine to predict the
  camera; exported frames must differ from Still wherever the engine predicts a zoom and match
  Still wherever it predicts none.

## Unit tests

- **Timeline mapping:** cuts, round trips, and slivers.
- **Easing and zoom weights:** monotonic, continuous, and bounded.
- **Camera:** viewport always legal, smooth frame to frame, chained zooms pan, manual
  overrides auto, and minimum-length zooms survive float error.
- **Cursor smoothing:** jitter removal, no overshoot, and parsing of untrusted JSON.
- **Auto zoom:** cluster placement, focus, intensity, frequency cap, edge-of-clip clamping,
  short clips, determinism, and clicks versus dwells.
- **Project model:** defaults, styles, edit promotion, clamping, round-trip save and load,
  validation errors, and trim edge cases.

## Environment notes

- Homebrew's `ffmpeg` on the development machine was broken (missing `libx265`). The tests
  therefore use the `ffmpeg-static` and `ffprobe-static` npm binaries. These are
  development-only and never shipped.
- The microphone path cannot be tested unattended: it needs a macOS permission prompt.

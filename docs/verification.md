# Verification Record

Final run: **2026-10-12**, MacBook Pro (Apple silicon, arm64), macOS 26.4.1 (25E253),
Node 22.21.0, Electron 40.10.6, Xcode Swift 6.3.3. The raw log is in
`tests/.artifacts/final-run.log` (git-ignored, regenerated on every run).

## Commands executed

```bash
npx eslint .
npm run typecheck
npx vitest run
npm run dist
FRAMEFLOW_REAL_CAPTURE=1 npx playwright test
```

`npm run dist` builds the native helper, the bundles, `FrameFlow.app` and the DMG.
The Playwright run builds the bundles first and includes the opt-in real-capture test.

## Results

| Check | Result |
|---|---|
| ESLint | ✅ 0 problems |
| TypeScript (main/preload/shared, renderer, tests; `strict`, `noUncheckedIndexedAccess`) | ✅ 0 errors |
| Unit tests | ✅ 53 / 53 in 6 files |
| Production build + packaging | ✅ `release/mac-arm64/FrameFlow.app` (262 MB, ad-hoc signed, fuses applied) and `release/FrameFlow-0.1.0-arm64.dmg` |
| End-to-end tests | ✅ 14 / 14 passed; 1 skipped (`08-screenshots`, a docs generator run separately) |

### End-to-end tests

| # | Test | What it proves |
|---|---|---|
| 01 | Import → play/pause/seek → export 1080p | App starts and Home renders. Import works. Play advances the playhead and preview, Pause holds, ruler seeks. Exported H.264 1920×1080 @60, exactly 1800 frames, 30.00 s, decodes cleanly, no black frames |
| 02 | Quick Demo full flow | Real UI recording (synthetic source), automatic zooms, export from Quick Demo, zooms visible in pixels (versus an auto-zoom-off export), style and format settings change the export, Advanced Editor shows the same auto zooms, editing one changes the export, undo/redo, quit and relaunch, reopen from Recents keeps the edit |
| 03a | Editing and sync | Background and padding update preview pixels. Cut 5–10 s: export is 25.00 s / 1500 frames, and the burned-in time code on both sides of the cut matches the expected source times (±0.15 s). Custom background and framing land where the shared layout says. Manual zooms on a video without cursor data: add, drag to move, delete with the keyboard, undo/redo. Square export with zooms |
| 03b | Edge cases | 1.5 s clip with a zoom covering it (90 frames). Portrait source in a landscape frame. AAC audio carried through a trim |
| 04 | Robustness | Permission-denied guidance, and the main process refuses to start. Missing media is relinked. Cancelled export leaves no file and no `.partial`. Unwritable destination gives a clear error. Discard deletes the recording. Quitting mid-recording leaves a playable MP4 plus cursor data. A crafted project cannot read `/etc/hosts` or a neighbouring JSON |
| 05 | **Real capture** | ScreenCaptureKit window capture of a local demo page while the real pointer moved. Recording is H.264 at Retina size, content changed during capture, telemetry was dense and normalized, ≥1 auto zoom from **real** cursor data, export decodes |
| 06 | 5-minute recording | Opens in 126 ms. Style edit with redraw takes 9.1 ms. Export takes 91.8 s (**3.27× realtime**) with peak main+renderer RSS of **366 MB**. 18 000 frames plus AAC, 300.07 s |
| 07 | Packaged app | The `.app` starts, records through its bundled helper, exports a valid 1080p MP4, and has no DevTools menu |

### Exported files inspected with ffprobe

| File | Video | Frames | Duration | Audio |
|---|---|---|---|---|
| landscape.mp4 (16:9) | h264 1920×1080 @60 | 1800 | 30.000 s | — |
| quick.mp4 (Quick Demo, auto zoom) | h264 1920×1080 @60 | 546 | 9.100 s | — |
| quick-nozoom.mp4 | h264 1920×1080 @60 | 546 | 9.100 s | — |
| quick-portrait.mp4 (9:16, Colorful) | h264 1080×1920 @60 | 546 | 9.100 s | — |
| edited.mp4 (auto zoom edited to 3.5×) | h264 1920×1080 @60 | 546 | 9.100 s | — |
| trimmed.mp4 (cut 5–10 s, custom background) | h264 1920×1080 @60 | 1500 | 25.000 s | — |
| square-zooms.mp4 (1:1, multiple zooms) | h264 1080×1080 @60 | 1500 | 25.000 s | — |
| short.mp4 | h264 1920×1080 @60 | 90 | 1.500 s | — |
| portrait-src.mp4 | h264 1920×1080 @60 | 360 | 6.000 s | — |
| audio.mp4 (cut 2–4 s) | h264 1920×1080 @60 | 360 | 6.080 s* | aac |
| long.mp4 | h264 1920×1080 @60 | 18000 | 300.075 s* | aac |
| real-capture.mp4 | h264 1920×1080 @60 | 478 | 7.967 s | — |
| packaged.mp4 | h264 1920×1080 @60 | 244 / 271 | 4.07 / 4.52 s | — |

\* The container duration includes AAC encoder padding (about 80 ms); the video track is
exact.

The following are included in `docs/media/`:

- `sample-quick-demo-synthetic.mp4`: a Quick Demo export of a synthetic recording.
- `sample-real-capture-demo-page.mp4`: a real ScreenCaptureKit window capture of the local
  demo page, exported through Quick Demo with Dynamic zoom.
- Product screenshots generated from the running app.

## Feature checklist

| Requirement | Status | Evidence |
|---|---|---|
| App builds | ✅ Verified | `npm run dist` |
| App starts | ✅ Verified | e2e 01, 07 (packaged) |
| Main UI usable | ✅ Verified | e2e 01–04 drive every screen through the UI; screenshots reviewed |
| Screen recording creates a real file | ✅ Verified | e2e 05: real ScreenCaptureKit window capture. A real full-display capture was also run once manually during development (3456×2234, 3.15 s) and deleted for privacy |
| Recording opens in the editor | ✅ Verified | e2e 02, 05, 07 |
| Import video | ✅ Verified | e2e 01, 03, 04 |
| Playback and seeking | ✅ Verified | e2e 01: Play for 1.5 s advances the time code (0.8–3 s) and changes preview pixels, Pause holds it, and a ruler click seeks to the middle. e2e 03 uses seeks to place cuts and zooms |
| Trimming | ✅ Verified | e2e 03: time code checked across the cut |
| Automatic zoom from recorded cursor data | ✅ Verified | e2e 02 (synthetic telemetry), e2e 05 (real telemetry), unit tests |
| Manual zoom adjustments | ✅ Verified | e2e 02 (edit auto zoom), e2e 03 (add, move, delete, undo) |
| Background and framing | ✅ Verified | e2e 02, 03 (pixel checks in preview and export) |
| Preview reflects edits | ✅ Verified | e2e 03 preview pixel checks. Preview and export share `renderFrame` |
| MP4 export is playable and correct | ✅ Verified | ffprobe and full decode of every export above |
| Save and reopen projects | ✅ Verified | e2e 02 (after app restart), 04 (relink) |
| Quick Demo usable video without the Advanced Editor | ✅ Verified | e2e 02 steps 1–5 |
| Advanced Editor preserves automatic edits | ✅ Verified | e2e 02 step 6 |
| Packaging | ✅ Verified | e2e 07 against the built `.app` |
| Microphone recording | ⚠️ Implemented, **not verified** | Requires a macOS microphone permission prompt that cannot be granted unattended |
| Permission-denied behaviour | ✅ Verified (UI and main-process refusal) | e2e 04 forces the state via a test-only env hook; the real OS "denied" state was not reproduced |
| Intel (x86_64) build | ❌ Not built or tested | Helper compiles universal; app packaging targets arm64 only |

## Code review

Independent automated reviews were run on the finished code:

- **Security review.** It found no critical issues and two high ones: project-supplied media
  and cursor paths were trusted. Both are fixed: projects are a trust boundary, media must be
  a real video file in the library, in the project folder, or in Recents; cursor JSON must sit
  next to the video. Also fixed: IPC sender validation, exact navigation allow-list, webview
  blocking, a production CSP without dev websockets, `wx` export temp files, one-shot export
  grants, a minimal helper environment, and Electron fuses. A regression test was added
  (e2e 04).
- **Code review.** Twelve medium and low findings were fixed:
  - trim drags merging neighbours,
  - float-epsilon drop of minimum-length zooms (unit test added),
  - serialized saves and recents writes,
  - media-handle and sample leaks on export errors,
  - history patching for mode switches and relinks,
  - double-click creating duplicate zooms,
  - playhead sync after a leading cut,
  - the stale frame on cut jumps,
  - handle floors,
  - gesture-scoped undo coalescing,
  - pointercancel cleanup.

## Not verified / limitations

- Microphone narration: see above.
- The real OS permission-*denied* flow. The permission was granted on this machine; the UI
  path was exercised with a test hook.
- Multi-display setups: one built-in display only.
- Notarized distribution builds: not attempted; no Developer ID is available.

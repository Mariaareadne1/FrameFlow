# Verification Record — FrameFlow 2.0 / 2.1

## 2.3 (notes) — 2026-10-12, branch `feat/annotations`

- **Unit tests: 96/96.** These include caption cleaning and the 120-character cap, pointer
  clamping, clearing a note removing its keys, round-tripping through `parseProject`, and an
  annotated auto Moment being treated as manual.
- **15 annotations.** A caption and an arrow were added to a Moment through the inspector and
  exported at 720p30.
  - The caption pill's background is dark ink at the middle of the Moment (luma < 90) where
    the plain export is white (> 200), and identical to the plain export (< 3/255) before
    the Moment starts.
  - More than 20 coral pixels lie within 26 px of the arrow tip predicted by the shared
    camera engine while zoomed (scale > 1.3); none are there in the plain export.
  - With camera movement turned off the caption is still rendered, and the note survives a
    reopen.
- **Test bug found and fixed.** The first version of the check sampled a band across the
  caption's light text, so the mean luma came out at 142. Looking at the frame showed the
  pill in the right place; the check now samples the pill's top padding.
- **Two flaky timeline tests found and fixed (test-only).** The first full run failed 03
  (1 in 3 runs alone), and the next run failed 09. In both, the test measured the timeline
  while the panel was still sliding in or out, so clicks and drags landed at about 0.72× the
  intended time (20 s → 14.4 s). A shared `settledBox` helper now waits until the element
  stops moving. 03, 09, 10 and 14, which all measure the timeline, then passed **21/21**
  runs (three repeats each).
- **Full regression on the packaged 2.3.0 build** (2026-10-13, `FRAMEFLOW_REAL_CAPTURE=1 npx
  playwright test`): ✅ **27 passed**, 1 skipped (the screenshot generator), **0 failed**.
  This includes real capture (05, 13), the packaged app (07), legacy pixel-identity (11),
  sound (12), GIF (14) and annotations (15). Lint and types are clean.

## 2.2 (GIF) — 2026-10-12, branch `feat/gif-export`

- **Unit tests: 93/93.** These include the delay error diffusion (exact totals for 10, 15
  and 20 fps), GIF sizing per aspect ratio, and safe parsing of export settings.
- **14 gif.**
  - The GIF is 720×406 with **75 frames** (5 s × 15 fps) and a duration of 5.00 s.
  - It loops (NETSCAPE2.0 extension present) and decodes cleanly.
  - Mean difference from the MP4 of the same project was **2.82, 2.80 and 2.77 out of 255**
    at three times.
  - Cancelling leaves no file and no `.partial`.
- **Quality bug found visually and fixed.** rgb444 quantisation banded the Aura gradient and
  erased light-grey UI detail. Switching to rgb565 fixed it and also lowered the mean
  difference from 3.5 to 2.8.
- **Full regression on the packaged 2.2.0 build** (`FRAMEFLOW_REAL_CAPTURE=1 npx playwright
  test`): ✅ **26 passed**, 1 skipped (the screenshot generator), **0 failed**. This includes
  real window capture (05), real system audio (13), the packaged app (07), legacy
  pixel-identity (11), sound (12) and GIF (14). Lint and types are clean.

## 2.1 (Sound) — 2026-10-12, branch `feat/sound`

| Check | Result |
|---|---|
| Lint, types | ✅ clean |
| Unit | ✅ **90 / 90**, including v3 migration, sound operations and sanitizing untrusted sound data |
| Package | ✅ `FrameFlow-2.1.0-arm64.dmg`; packaged app re-tested (07 ✅) |
| E2E full run | `FRAMEFLOW_REAL_CAPTURE=1 npx playwright test` → ✅ **25 passed**, 1 skipped (screenshot generator) |

New end-to-end evidence:

- **12 sound.** Audio was analysed per frequency band in the exported MP4s.

  | Export | 440 Hz (system) | 660 Hz (mic) | 880 Hz (imported) |
  |---|---|---|---|
  | Default mix | > −32 dB | > −32 dB | |
  | Microphone at 0 | > −32 dB | ≥ 20 dB below the audible tone and the default mix | |
  | System audio at 0 | ≥ 20 dB below | > −32 dB | |
  | With an imported track and a 1–2 s cut | > −32 dB | > −32 dB | > −32 dB |

  - With the cut, the duration matches the video to within ±0.15 s.
  - After reopening, `sound` is unchanged.
  - The old pass-through path still carries a video's own AAC.
  - A silent 1.5 s video plus a 12 s voice-over exports at 1.5 s with the voice-over.
- **13 real system audio.** This is a real ScreenCaptureKit window capture while the demo
  page played a quiet 523 Hz tone. The recording measured **−28.3 dB at 523 Hz against
  −70.3 dB at 1500 Hz**, and the tone survives export.
- **Bug found and fixed.** The first window recording with system audio was silent
  (−91 dB). A window filter only hears that window's process, and Chromium and Electron play
  sound from helper processes. Window recordings now take system audio from an audio-only
  display stream. A helper-level check with a display capture and `afplay` had already
  measured −49.6 dB, which isolated the cause.
- Microphone capture on real hardware is **still not verified**: it needs a permission prompt.
  The mic *pipeline* (separate file, mixing and levels) is verified through the synthetic
  source.

---


The final runs were on **2026-10-12**: a MacBook Pro (Apple silicon), macOS 26.4.1, Node
22.21.0, Electron 40.10.6, branch `feat/editorial-studio`. The pre-redesign baseline (all
green) is recorded in [redesign-baseline.md](redesign-baseline.md). The 0.1 record is
preserved at the end of this file.

> **Environment note.** During the final runs an unrelated process on the machine
> (`chrome-headless-shell`, not part of FrameFlow or its tests) kept 2–4 cores busy. Load
> averages were 25–145. Correctness is unaffected. Timing figures below are therefore
> pessimistic, and two long tests hit their old 3-minute budgets (see "Failures and fixes").

## Commands and results

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | ✅ 0 problems |
| Types | `npm run typecheck` (main/preload/shared, renderer, tests) | ✅ 0 errors |
| Unit | `npx vitest run` | ✅ **82 / 82** (8 files) |
| Package | `npm run dist` | ✅ `FrameFlow.app` (263 MB) and `FrameFlow-2.0.0-arm64.dmg` (113 MB), ad-hoc signed, fuses applied |
| E2E, full suite | `FRAMEFLOW_REAL_CAPTURE=1 npx playwright test` | 21 passed, 1 failed (02, timeout only), 1 skipped (08 screenshot generator) |
| E2E, reruns after fixes | `npx playwright test 02 04` and then `07` on the repackaged app | ✅ 02 passed, 04 passed (7/7), 07 passed |

**Net result: all 22 functional end-to-end tests pass.** The only skipped test is the docs
screenshot generator, which also ran successfully on its own.

### After the independent code review

The review fixes are listed in "Failures and fixes" below. After them, everything was re-run
on the final commit:

- Unit tests: **86/86**.
- End-to-end, rerun: 01, 02, 04 (7/7), 06 (gallery and 5-minute), 07 (repackaged app),
  09, 10 (3/3) and 11 (3/3). **18 + 2 passed.** Legacy projects are still pixel-identical
  (0.00), and parity is 2.35, 2.18 and 4.66 out of 255.
- Spec 03 failed once in that combined run: a test-timing race, where it acted before a ruler
  seek had landed. After hardening the seek helper, 03 passed 2/2 and its editing test passed
  4 more consecutive runs.
- **Spec 05 (real capture) was rerun later, once the display was awake (21:20): ✅ passed on
  the final commit (21.2 s).** At first it could not be rerun after the review fixes: By then the Mac's
  display was **asleep**: `CGDisplayIsAsleep` = 1, with no active displays, so ScreenCaptureKit
  had no pixels to capture and the source thumbnails were blank. I did not wake the display.
  - Real capture last passed on the 2.0 build at 18:44 in the full run.
  - None of the review fixes touch the capture helper, `capture.ts` or the recording UI.
  - 5-minute performance at lower load: open 208 ms, edit 9.5 ms, export 2.86× realtime,
    peak RSS 379 MB.

## End-to-end tests

- **01 import-export**
  - Launch, then import.
  - Play advances the timecode and preview, pause holds, and seeking works.
  - 1080p60 export: 1800 frames, 30.000 s, clean decode, no black frames.
- **02 quick-demo**
  - A synthetic recording opens straight into the Studio with the defaults (Editorial, Calm,
    Halo). Its automatic Moments show as cards.
  - It exports without opening the Timeline.
  - The Calm export differs from the Still export where zoomed, and is identical before any
    zoom.
  - An Aura 9:16 export is 1080×1920 with a lavender backdrop.
  - The Timeline shows the same Moments. A Moment is edited there and becomes manual.
  - Undo and redo work. After quit, relaunch and reopen from the gallery, the edit is intact.
- **03 editing**
  - Background and padding changes update the preview pixels.
  - A 5–10 s cut is verified by burned-in time code on both sides of the cut. It exports at
    25.000 s / 1500 frames.
  - Manual Moments on a video without telemetry can be added, dragged, deleted, undone and
    redone. A square export works.
  - A 1.5 s clip, a portrait source, and AAC audio through a cut all work.
- **04 robustness**
  - Permission denied shows guidance, and the main process refuses to record.
  - Missing media can be relinked.
  - Export cancel and an unwritable export destination both behave correctly.
  - Discard (now with confirmation) works.
  - Quitting mid-recording still leaves a playable MP4.
  - A crafted project file cannot read `/etc/hosts`.
- **05 real capture** ✅
  - A real ScreenCaptureKit window capture of a local demo page, with real cursor telemetry
    and automatic Moments.
  - The export decodes.
  - This retests native capture on the 2.0 build.
- **06 performance**
  - 5-minute recording:
    - opens in 461 ms
    - style change with redraw (main preview plus five live style cards): 13.1 ms
    - export: 18,000 frames with AAC in 117 s, **2.57× realtime under load** (baseline 3.27×
      on a quieter machine)
    - peak main+renderer RSS: **329 MB** (baseline 346 MB)
  - A **60-project gallery** appears 2.3 s after launch, and scrolling takes 8.2 ms per frame.
- **07 packaged app**
  - The `.app` records through its bundled helper and exports 1080p.
  - It has no DevTools menu.
  - The reported version is 2.0.0.
- **09 Moments**
  - Each card's thumbnail is decoded and its burned-in time code matches that Moment's time.
  - Selecting a card seeks to it to within 0.15 s.
  - Renaming a Moment and changing its zoom update the real `ZoomEvent`, which becomes manual.
  - Switching to Focus and back keeps the edit.
  - Disable, delete, undo, redo and add all work.
  - A cut before a Moment keeps its source time. A Moment inside a cut shows "Removed by a cut".
  - Dragging in the Timeline moves the same event the card shows.
  - The export is shorter by exactly the cuts.
- **10 creative**
  - All **five styles** were exported at 720p30: 150 frames each, clean decodes.
    - Midnight is dark.
    - Editorial is light and warm.
    - Studio is neutral.
    - Aura is lavender.
    - Canvas is warmer than Editorial, with measurable grain that is stable between frames.
  - Custom padding marks the style as custom and survives 9:16 and 1:1 exports.
  - **Camera feels**: Still, Calm, Follow and Focus were exported. At 19 instants each, the
    frames differ from Still exactly where the shared engine predicts a zoom, and match Still
    where it predicts none.
    - Focus's peak scale is more than 0.4 above Calm's.
    - Follow travels further than Calm.
  - **Cursor treatments**: Natural, Halo, Spotlight and Pulse were exported.
    - Halo and Pulse change the area near the click.
    - Spotlight dims the far area right after a click, and does nothing away from clicks.
    - Pulse has faded by 1.1 s after the click.
  - **Preview/export parity**: the preview canvas was compared with the exported frame at
    three instants (mid-zoom, mid-transition, no zoom). Mean absolute differences were
    **2.35, 2.18 and 4.66 out of 255**, which is encoding noise.
- **11 legacy projects**: three real 0.1 project files (recording, dynamic, import).
  - Each opens without the file being rewritten.
  - Each export was compared with frames **exported by FrameFlow 0.1**. The mean difference
    was **0.00 at all 18 compared instants**, so the output is pixel-identical.
  - An edit saves the project as v2 and writes a `.v1.bak` that is byte-identical to the
    original.
  - Each reopens intact.

## Exported sample videos (inspected with ffprobe and a full decode)

| Sample | Settings | Result |
|---|---|---|
| Studio + Calm | `style-studio.mp4` | h264 1280×720, 150 frames |
| Editorial + Moments (edited) | `moments.mp4`, `quick.mp4` | h264 1920×1080; cuts shorten the duration exactly |
| Aura + Follow | `feel-follow.mp4` (Aura via 02's portrait export) | h264; Follow frames match the engine |
| Canvas + Pulse | `style-canvas.mp4` plus the `cursor-pulse.mp4` treatment | h264; grain and ripple verified |
| Midnight + Focus | `style-midnight.mp4`, `feel-focus.mp4` | h264; dark backdrop and Focus zoom verified |
| Manual edits with trims | `trimmed.mp4`, `square-zooms.mp4` | 25.000 s, 1500 frames; time code verified across the cut |
| Legacy project | `v1-*.mp4` | pixel-identical to 0.1 |
| Imported video without telemetry | `landscape.mp4`, `portrait-src.mp4` | no synthetic cursor; manual Moments work |

Three samples are committed in `docs/media/`:

- `sample-quick-demo-synthetic.mp4`
- `sample-real-capture-demo-page.mp4`
- `sample-focus-camera.mp4`

## Failures found during verification, and fixes

- **Duplicate Moment ids after a feel change.** An edited auto Moment kept its id, and
  regeneration created another Moment with that id.
  - Fixes: unique ids on regeneration, and automatic Moments that overlap a manual one are
    dropped.
  - Covered by a unit test and by spec 09.
- **Muddy light backdrops.** Radial fades went through grey.
  - Signature presets now fade to the same colour. Classic presets keep the 0.1 fade so legacy
    output is unchanged.
- **Focus zoom jumped 0.23× in one frame.** The 0.1 "snappy" easing starts at full velocity.
  - Fix: a new "crisp" easing that starts at rest, plus a minimum 0.7 s pan hand-off.
- **Packaged app hung at launch after a rebuild.** The Electron cookie-encryption fuse makes
  the app read a Keychain item at startup, and macOS blocks on an access prompt for every
  newly signed build.
  - Fix: the fuse is disabled. FrameFlow uses no cookies.
  - Repackaged, and test 07 passes.
- **Independent code review (no HIGH issues).** Fixes:
  - The minimum pan hand-off is now a per-project setting. Migrated 0.1 projects keep
    0.05 s, so chained short-ramp zooms render exactly as before.
  - The backdrop cache is now LRU with 12 entries, so live style cards don't evict the
    preview.
  - Style cards and the export preview redraw after a seek lands. The throttle timer is
    cleaned up.
  - Writes to the same project file are serialized, so a rename from the gallery can't race
    an autosave.
  - Recents checks are async.
  - The missing-video badge only stores granted paths.
  - The frame grabber recovers from a failed load and releases its video when leaving the
    Studio.
  - `shadowTint` must be 3- or 6-digit hex.
  - Named or disabled automatic Moments load as edits.
  - Edited legacy looks become "custom".
  - Covered by 4 new unit tests.
- **Spec 02 timed out at 3.0 min in the loaded full run.** Every assertion had already passed;
  it was in its final relaunch step. It now has a 7-minute budget and passes (1.4 min).

## Not verified, and limitations

- **Microphone narration.** The macOS microphone permission was never granted on this
  machine, and asking would show a system prompt. The code path exists but is untested.
- **The real OS "denied" permission state.** It is exercised through a test-only environment
  hook, because permission is granted here.
- **Multi-display capture.** Only a single built-in display was available.
- **Intel builds.** The helper is built universal, but the app was packaged for arm64 only.
- **Notarized distribution.** No Developer ID was available.

---

# Appendix: FrameFlow 0.1 verification (historical)

0.1 was verified with: lint and typecheck clean, 53/53 unit tests, 14/14 end-to-end tests
(including real capture), and 1080p60 exports inspected with ffprobe. The full table is in
the git history of this file (commit `0b6ab88`).

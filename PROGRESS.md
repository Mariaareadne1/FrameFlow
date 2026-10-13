# FrameFlow — Progress Log

_Last updated: 2026-10-12 (FrameFlow 2.3 — notes on Moments)_

## 2.3 (branch `feat/annotations`, merged to `main`)
- [x] Captions (top/bottom) and pointer arrows on Moments, in preview, MP4 and GIF.
- [x] Tests: 96 unit tests; e2e 27 passed / 1 skipped / 0 failed on the packaged build.
- [x] Fixed two flaky timeline tests (03, 09) that measured panels mid-animation.
- Next: the permission-gated items (microphone check, webcam), which need a person to
  approve the macOS prompts.

## 2.2 (branch `feat/gif-export`, merged to `main`)
- [x] Animated GIF export (shared renderer, rgb565 per-frame palettes, exact delays, loops,
      streamed, cancellable). Width and fps are set in the export sheet.
- [x] Tests: 93 unit tests; e2e 26 passed / 1 skipped / 0 failed on the packaged build.
- Next: annotations (text, arrows), then the permission-gated items (microphone check,
  webcam) once a person can approve the macOS prompts.

## 2.1 (branch `feat/sound`, merged to `main`)
- [x] System audio capture (real capture verified, including window recordings via an
      audio-only display stream).
- [x] Microphone as a separate track when system audio is also on.
- [x] Imported audio tracks with levels, synced preview playback, and a mixed AAC export.
- [x] Project format v3 (additive migration), Sound panel in the dock, and Sound toggles in
      record setup.
- [x] Tests: 90 unit tests, and 25/25 end-to-end tests including 12-sound and
      13-real-system-audio.
- Next: verify the microphone by hand (needs a permission prompt), then webcam
  picture-in-picture (needs camera permission).

## Branch and state
- Working branch: `feat/editorial-studio`, which merges into `main` after the full regression
  passes.
- The baseline record is `docs/redesign-baseline.md`. Everything was green before the
  redesign.
- Verification results are in `docs/verification.md`.

## Completed (2.0)
- [x] Baseline: tests, before screenshots, real v1 project fixtures, and golden frames from 0.1.
- [x] Project format v2 with a v1 migration that preserves output exactly (proven
      pixel-identical) and a `.v1.bak` on first save.
- [x] Engine:
  - Camera Feel (Still, Calm, Follow, Focus) with tuning
  - a dead-zone camera path
  - crisp easing
  - minimum pan hand-off
  - Moment labels and disable
  - id-safe regeneration
- [x] Renderer:
  - signature backdrops with soft fades, vignette and seeded grain
  - tinted shadows
  - Natural, Halo, Spotlight and Pulse cursor treatments
  - path memoization
- [x] UI:
  - an editorial design system with bundled OFL fonts
  - a new mark
  - the gallery Home (rename, reveal, remove, missing badge)
  - record setup and HUD
  - the Studio (dock, transport, Moments, Design/Camera/Cursor drawers, Timeline)
  - the export sheet and the settings sheet
- [x] Tests:
  - unit tests (82)
  - end-to-end tests for Moments, the five styles, the four feels, the four cursor
    treatments, preview/export parity, legacy golden frames, a 60-project gallery, and the
    packaged app
- [x] Docs: README, redesign, comparison, architecture, testing, roadmap and verification.

## Test status (final)
- Unit tests: 86/86.
- End-to-end: all 22 functional specs passed. The specs affected by the review fixes were
  rerun on the final code. Real capture (05) was rerun and passed on the final commit once the display woke up.

## Known issues and limits
- Microphone narration is not verified (it needs an OS prompt).
- Performance numbers in the final run were taken while an unrelated process used ~270% CPU
  (load average 30–145). Correctness tests are unaffected. Speed figures are conservative.
- macOS on Apple silicon only. Builds are not notarized.

## Next steps
1. Verify microphone recording by hand.
2. Pick from `docs/roadmap.md` › Next: webcam, cursor shapes, free-standing text.

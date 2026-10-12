# Redesign Baseline (FrameFlow 0.1 → 2.0)

This baseline was recorded on **2026-10-12** before any 2.0 changes. It was taken from
branch `feat/editorial-studio` at `8fc477b` (identical to `origin/main`), with a clean working
tree. The remote is `https://github.com/Mariaareadne1/FrameFlow.git`.

## Commands and actual results

| Step | Command | Result |
|---|---|---|
| Install | `npm ci` | ✅ |
| Fixtures | `npm run fixtures` | ✅ (all five exist / regenerated) |
| Types | `npm run typecheck` | ✅ 0 errors |
| Lint | `npm run lint` | ✅ 0 problems |
| Unit | `npx vitest run` | ✅ 53 / 53 |
| Package | `npm run package` | ✅ `release/mac-arm64/FrameFlow.app` |
| E2E | `FRAMEFLOW_REAL_CAPTURE=1 npx playwright test` | ✅ 14 passed, 1 skipped (screenshot generator) |

The E2E run includes real ScreenCaptureKit window capture (05), which passed. The
5-minute performance run measured:

- open: 126 ms
- style edit: 8.9 ms
- export: 91.9 s (3.27× realtime)
- peak RSS: 346 MB

The raw log is `tests/.artifacts/baseline.log`. It is git-ignored.

## Pre-existing failures

None. Every failure found during the redesign is therefore a regression introduced by it.

## Before screenshots

`docs/redesign/before/` holds the 0.1 UI:

- `home-empty`
- `home`
- `record-setup`
- `recording-hud`
- `quick-demo`
- `advanced-editor`
- `zoom-inspector`
- `export-dialog`
- `settings`

## Legacy compatibility fixtures

These are captured with the 0.1 code, before any model change:

- `tests/fixtures/legacy/v1-recording.frameflow`: Colorful, Subtle auto zoom, one cut, one
  edited zoom (2.4×, fixed focus), and custom cursor size and smoothing.
- `tests/fixtures/legacy/v1-dynamic.frameflow`: Minimal, Dynamic (cursor-following) zooms,
  ripple off, 9:16.
- `tests/fixtures/legacy/v1-import.frameflow`: an imported video, no telemetry, a solid
  background, and Advanced mode.
- `tests/fixtures/legacy/golden/*.png`: frames at six output times from each project as
  **exported by FrameFlow 0.1**.

  The 2.0 test suite re-exports the same projects and compares them against these frames.
  The capture is reproducible with `tests/legacy-golden/capture-golden.spec.ts`.

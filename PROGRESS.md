# FrameFlow — Progress Log

_Last updated: 2026-10-12_

## Current state
Working end-to-end on macOS (Apple silicon, macOS 26): record (native ScreenCaptureKit helper) →
automatic edits (Quick Demo) → Advanced Editor → MP4 export → save/reopen.

## Completed milestones
- [x] Reference research (OpenScreen + fork) → `docs/architecture.md`
- [x] Pure engine: timeline/trim mapping, cursor smoothing, camera/zoom chaining, auto-zoom (unit tested)
- [x] Native capture helper (Swift/ScreenCaptureKit): hidden system cursor, 60 Hz cursor + click telemetry,
      H.264 MP4 via AVAssetWriter (fragmented while writing), stdin/signal stop, synthetic test source
- [x] Electron main: sandboxed renderer, typed IPC with validation, path allow-lists, ranged media protocol
- [x] Renderer: Home, Record, Processing, Quick Demo, Advanced Editor, HUD, Export & Settings dialogs
- [x] Shared `renderFrame` for preview and export (Canvas 2D); WebCodecs H.264 via mediabunny, streamed to disk
- [x] Projects: `.frameflow` JSON, autosave, recents, missing-media relink, validation on load
- [x] E2E (Playwright/Electron): import→export; Quick Demo full flow; editing/trim/zoom/style; edge cases

## Remaining
- [ ] E2E: permission-denied UI, missing media relink, export cancel, recording discard
- [ ] Opt-in real-capture E2E (window capture of a local demo page)
- [ ] Long-recording performance check (5+ min)
- [ ] Packaging with electron-builder + packaged-app smoke test
- [ ] Docs: README, testing.md, roadmap.md, verification.md
- [ ] Push to GitHub

## Decisions
- Canvas 2D (not PixiJS) — one deterministic `renderFrame` for preview + export.
- Camera/cursor paths are precomputed & pure functions of time → seek/preview/export identical.
- mediabunny (MPL-2.0, unmodified) for demux/decode/encode/mux instead of shipping GPL FFmpeg.
- Auto zoom uses clicks + dwells; distant interactions become chained zooms (pans), not one wide zoom.

## Test status
- Unit: 52 passing (`npm test`)
- E2E: 01 import/export, 02 quick demo, 03 editing (2 tests) passing (`npm run test:e2e`)

## Next actions
See "Remaining" in order.

# FrameFlow — Progress Log

_Last updated: 2026-10-12_

## Current state
v0.1 is feature-complete for the MVP and verified end to end on macOS 26 (Apple silicon).
The full verification record is in `docs/verification.md`.

## Completed milestones
- [x] Reference research (OpenScreen and its fork), written up in `docs/architecture.md`
- [x] Pure engine: timeline/trim mapping, cursor smoothing, camera with zoom chaining,
      auto zoom, layout (unit tested)
- [x] Native ScreenCaptureKit helper: hidden cursor, 60 Hz cursor and click telemetry,
      H.264 MP4, crash-safe fragments, synthetic test source
- [x] Electron main process: sandboxing, validated IPC, sender checks, path trust boundary,
      ranged media protocol
- [x] UI: Home, Record, Processing, Quick Demo, Advanced Editor (timeline and inspector), HUD,
      Export, Settings
- [x] Shared preview/export renderer; WebCodecs export streamed to disk, with audio
- [x] Projects: autosave, Recents, Open, validation, relinking missing media
- [x] Unit tests (53) and end-to-end tests (14), including real capture, a 5-minute
      performance run and the packaged app
- [x] Packaging (`.app` and DMG, ad-hoc signed, Electron fuses)
- [x] Security review and code review findings fixed
- [x] Docs: README, architecture, testing, roadmap, verification, third-party notices

## Open items
- [ ] Verify microphone narration manually. The code path exists, but granting the
      permission needs a person.
- [ ] Developer ID signing and notarization for distribution.
- [ ] Secondary features listed in `docs/roadmap.md`: system audio, webcam, annotations, GIF.

## Next actions for a new session
1. `npm install`, then `npm run fixtures`, then `npm test`, then `npm run test:e2e` to confirm
   a green baseline.
2. Pick the next item from `docs/roadmap.md` › Next.

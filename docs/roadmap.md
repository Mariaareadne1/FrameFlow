# Roadmap

## Done (v0.1)
- Native macOS recording of a display or window. The system cursor is hidden; cursor and
  click telemetry are recorded at 60 Hz. There is a countdown, a floating stop HUD, ⌘⇧2 to
  stop, and discard. Recordings survive the app quitting.
- Quick Demo: automatic zooms, cursor smoothing, style, background and format presets, and
  export in a few clicks.
- Advanced Editor:
  - a timeline with editable automatic and manual zooms, and cuts;
  - a zoom inspector for level, focus (follow cursor or fixed point), timing, transition and
    easing;
  - look controls for background, padding, radius, shadow, scale and format;
  - cursor controls;
  - undo/redo and keyboard shortcuts.
- One shared renderer for preview and export. Export is H.264 MP4 from 720p to 4K at 30 or
  60 fps, with AAC audio passthrough, progress, cancel and atomic writes.
- Projects are autosaved, appear in a recents list, can be opened from disk, are validated
  on load and save, and can be relinked when media is missing.
- Packaged, ad-hoc signed macOS app (arm64) with Electron fuses.

## Implemented, not yet verified on real hardware
- Microphone narration (ScreenCaptureKit microphone output, macOS 15+). It needs a manual
  run, because granting microphone permission requires a person.

## Next
1. Manually verify microphone recording, then add an audio level meter to the record screen.
2. System audio capture (ScreenCaptureKit `capturesAudio`), mixed with the microphone.
3. Webcam picture-in-picture.
4. Real cursor shapes (I-beam, pointer) captured from `NSCursor`.
5. Text and arrow annotations on the timeline.
6. GIF export.
7. Keyboard shortcut overlay. This needs Input Monitoring permission.
8. On-device captions.
9. Developer ID signing, notarization and auto-update.
10. Windows and Linux capture back-ends. The engine and renderer are platform-neutral.

## Ideas
- Motion blur during fast camera pans.
- Speed ramps for idle sections, so long pauses are shortened automatically.
- Smart crop for vertical formats that keeps the focus area in view.

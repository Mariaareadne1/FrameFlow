# Roadmap

## Done in 2.0 (editorial studio)
- An editorial design system: warm paper, ink, and lavender/coral accents. Instrument Serif
  and Inter are bundled for offline use. There is a new mark and wordmark, motion is gentle,
  and reduced motion is respected.
- A gallery Home with real thumbnails, rename, Show in Finder, remove from Recents,
  missing-video badges, and an empty state.
- A redesigned recording setup and HUD. The native capture lifecycle is unchanged.
- The canvas-first **Studio** has a dock for Moments, Design, Camera, Cursor and Timeline,
  contextual drawers, and a transport with Moment ticks and previous/next Moment.
- **Moments** are cards with real frames and honest labels. Each one can be renamed,
  previewed, given a different zoom, framing, motion or timing, turned off, deleted, or added.
  They stay in sync with the Timeline.
- **Visual styles**: Studio, Editorial, Aura, Canvas (with deterministic grain) and Midnight,
  each with a live-rendered preview card. The 0.1 gradients remain available as classic
  backdrops.
- **Camera Feel**: Still, Calm, Follow (with a dead zone) and Focus, each tunable for
  intensity, speed, softness and following.
- **Cursor treatments**: Natural, Halo, Spotlight and Pulse, rendered into the export.
- An export sheet with a live composition preview, aspect, resolution, frame rate, quality,
  destination, real progress, and success and error states.
- Project format v2 with a lossless v1 migration. 0.1 output is pixel-identical and a
  `.v1.bak` is written on first save.

## Done in 0.1
- Native macOS recording with hidden cursor, telemetry, countdown and HUD.
- Automatic and manual zooms, cuts, and undo/redo.
- A shared preview and export renderer.
- H.264/AAC export, projects, packaging, and a security-hardened Electron shell.

## Implemented, not yet verified on real hardware
- Microphone narration, using the ScreenCaptureKit microphone output (macOS 15+). Granting
  the permission requires a person.

## Next
1. Verify microphone recording manually, then add a level meter.
2. Capture system audio and mix it with the microphone.
3. Webcam picture-in-picture.
4. Real cursor shapes (I-beam, pointer).
5. Text and arrow annotations on Moments.
6. GIF export.
7. Keyboard shortcut overlay. This needs Input Monitoring permission.
8. On-device captions.
9. Developer ID signing, notarization and auto-update.
10. Windows and Linux capture back-ends.

## Ideas
- Optional "dark studio" theme for the UI chrome.
- Motion blur during fast pans.
- Speed ramps for idle stretches.
- Smart vertical crop that follows the active Moment.

# FrameFlow 2.0 — Editorial Creative Studio

This document records the 2.0 redesign: its direction, its system and the architectural
decisions behind it. FrameFlow 2.0 keeps the 0.1 engine:

- ScreenCaptureKit helper and telemetry
- project model
- camera and auto-zoom engine
- shared Canvas renderer
- WebCodecs exporter

It replaces the product experience around that engine.

## Direction

The 0.1 app looked like a conventional dark video editor: dashboard cards, a permanent
settings sidebar and a dominant timeline. 2.0 is a light, warm, **editorial studio**:

- The composition is the hero. The canvas sits on an ivory "desk" with generous margins,
  and controls appear only when asked for.
- Choices read as art direction ("Editorial", "Calm", "Halo") rather than parameters. Every
  preset is still fully adjustable afterwards.
- Precision remains available. The timeline is one tab away, not the starting point.

## Colour

| Token | Value | Use |
|---|---|---|
| `paper` | `#F7F5F0` | App background (warm ivory) |
| `surface` | `#FFFFFF` | Cards, sheets, inspector |
| `sunk` | `#EFEEE9` | Wells, inactive segments, track backgrounds |
| `ink` | `#25262B` | Primary text, primary buttons |
| `ink-2` | `#75757C` | Secondary text |
| `ink-3` | `#A3A3A8` | Tertiary text, disabled |
| `line` | `#DFDED8` | Hairlines and separators |
| `lavender` | `#AA9ACF` | Accent: selection, focus, Moments |
| `lavender-ink` | `#6C5A9C` | Accent text on light surfaces (WCAG AA on paper) |
| `coral` | `#E7A99A` | Secondary accent: recording, cuts |
| `coral-ink` | `#B4604C` | Coral text, destructive actions |

Accents are used sparingly, for selection, the active Moment, recording state and cuts.
Primary actions are ink-on-paper buttons rather than coloured buttons.

## Typography

Fonts are bundled from Fontsource, are SIL OFL licensed, and work offline:

- **Instrument Serif** for display headings, project names on cards, and the empty state.
- **Inter** (variable) for every UI control and body text.
- System monospace for timecodes.

The scale is 11 / 12 / 13 / 15 / 18 / 24 / 40 / 56 px. Display sizes use the serif with
slight negative tracking. Controls stay at 12–13 px Inter.

## Space, shape and motion

- The spacing scale is 4, 8, 12, 16, 24, 32, 48 and 64 px.
- Corner radii are 10 for controls, 16 for cards and 22 for sheets.
- Separation comes from surface contrast and soft shadows, not outlines. Hairlines appear
  only where structure needs them.
- Motion lasts 160–240 ms with `cubic-bezier(.2,.8,.2,1)`. It covers inspector slide-in,
  sheet rise, selection-indicator glide and hover lift. `prefers-reduced-motion` disables it.

## Navigation

```
Projects (gallery) ──► Record setup ──► [recording + HUD] ──► Studio
        └────────────► Import ───────────────────────────────► Studio
```

**Studio** is one screen that replaces both "Quick Demo" and "Advanced Editor". It has:

- **Top bar**: back to Projects, editable name, save state, undo/redo, and the ink
  Export button.
- **Canvas**: the styled composition, centred, which resizes as panels open.
- **Transport**: play/pause, previous/next Moment, a scrubber with Moment ticks and cut
  shading, and time.
- **Dock**: `Moments · Design · Camera · Cursor · Timeline`.
  - **Moments** opens a filmstrip of Moment cards under the transport.
  - **Design**, **Camera** and **Cursor** open a right-hand inspector drawer.
  - **Timeline** (the Advanced Editor) expands the precision timeline across the bottom,
    with the event inspector on the right.

All sections share one mounted preview and one project store. Switching sections never
reloads media or moves the playhead. `project.mode` remembers whether the user was last in
the Timeline.

## Moments

A **Moment is a `ZoomEvent`**. There is no parallel data:

- Cards list `project.zooms` in time order and are numbered "Moment 01…". A subtitle such as
  "Click at 0:08" or "Focus at 0:17" comes from real telemetry: a click inside the event
  gives "Click", otherwise "Focus". Users can rename a Moment, and the name is stored as the
  optional `ZoomEvent.label`.
- Card times are **output** times (`sourceToOutput`). Stored times stay in source seconds,
  so cuts never shift Moments. A Moment entirely inside a cut is shown as "Cut" and still
  exists. A partially cut Moment shows its visible portion.
- Thumbnails are real source frames, captured by an off-screen `<video>` at the Moment's
  focus time through a serialized, cached queue. The camera's viewport is outlined over the
  frame.
- Editing works through the existing model operations: `updateZoom` (which promotes
  auto→manual, so later camera changes keep the edit), `removeZoom` and `addManualZoom`.
  Disabling a Moment sets `ZoomEvent.disabled`. The renderer skips disabled events and the
  data is kept.
- The Timeline edits the same events, so both views update together, and undo/redo covers
  both.

## Visual styles

`styles.ts` defines five art directions. Each one maps to real render parameters (background
layers, frame padding, radius and shadow strength, plus the new shadow tint):

| Style | Backdrop | Frame |
|---|---|---|
| **Studio** | Soft neutral grey gradient | Moderate padding, 14 px radius, neutral soft shadow |
| **Editorial** (signature) | Warm ivory with a faint warm vignette | Generous padding, 18 px, warm-tinted shadow |
| **Aura** | Luminous lavender, blue, pink and coral blooms | Clean padding, 20 px, cool shadow |
| **Canvas** | Warm paper with deterministic grain | Editorial padding, 10 px, matte contact shadow |
| **Midnight** | Charcoal / blue-black with a subtle lavender glow | Tight padding, 14 px, glow-tinted shadow |

Grain comes from a seeded PRNG tile scaled to the output's short side, and is cached in the
backdrop. The same seed and resolution always give identical pixels, with no flicker. The
eight 0.1 gradients and the solid colours remain available as palette options, and legacy
`clean`, `minimal` and `colorful` projects keep their exact stored values.

Choosing a style changes only the background and frame. Camera, cursor, Moments and cuts are
untouched.

## Camera Feel

`project.camera` holds `{ feel, intensity, speed, softness, followSmoothing, deadzone }`.

| Feel | Behaviour (all derived from cursor telemetry) |
|---|---|
| **Still** | No automatic camera. Manual Moments still play. |
| **Calm** | 1.5×, fixed framing per interaction cluster, slow 0.9 s smooth transitions, long holds, at most 5 per minute. This is exactly 0.1's "Subtle". |
| **Follow** | 1.8×, the camera follows a lazily smoothed cursor with a **dead zone** so tiny movements don't move it, longer chain gap, so neighbouring interactions become pans. |
| **Focus** | 2.2×, centred on click clusters (clicks only), snappy 0.55 s transitions, shorter lead-in and hold. |

The advanced controls are:

- **Intensity** scales the zoom magnitude of automatic Moments.
- **Speed** scales transition length.
- **Softness** chooses smooth or snappy easing.
- **Follow smoothing** sets the camera path smoothing time.
- **Dead zone** sets how far the cursor may move before the camera follows.

Changing the feel regenerates only untouched automatic Moments. Manual and edited Moments
always survive.

## Cursor treatments

`project.cursor.effect` is one of `natural | halo | spotlight | pulse`, with
`effectIntensity` from 0 to 1.

| Treatment | Rendering (in the shared renderer, so it is exported) |
|---|---|
| **Natural** | Pointer only, with a subtle press squash on click. Matches 0.1 with click effect off. |
| **Halo** | A soft translucent disc under the pointer that swells briefly on clicks. |
| **Spotlight** | On click, a gentle radial vignette, transparent around the click and lightly darkened beyond. It eases in and out over about 0.9 s. |
| **Pulse** | An expanding, fading ring on each click. Matches 0.1's ripple. |

Effects go through the same viewport projection as the pointer, so they stay attached under
zoom, and they use source time, so they stay attached after cuts.

## Project format v2 and migration

v1 → v2 runs in `parseProject`:

- `autoZoom` maps to `camera.feel`:
  - `off` → `still`
  - `subtle` → `calm` (identical parameters)
  - `dynamic` → `follow` (the cursor-following behaviour)
- Migrated projects get legacy camera tuning: dead zone 0 and 0.45 s follow smoothing, so
  existing cursor-following zooms render exactly as before.
- `cursor.clickEffect` maps to `effect`: `true` → `pulse`, `false` → `natural`. Both are
  pixel-identical to 0.1.
- `style` keeps legacy ids, and stored background and frame values are untouched.
- Stored zooms and trims are never regenerated on load.

When a v1 file is first saved, main writes `<file>.v1.bak` before the atomic replace. Files
from a newer version are refused with a clear message.

## Architecture decisions

- **One source of truth.** Every panel calls the existing `projectModel` operations through
  `editorStore.apply`, so history, autosave, preview and export all see the same object.
- **No CSS-only effects.** Styles, grain, glow and cursor treatments all live in
  `renderFrame`. Style preview cards call `renderFrame` on small canvases with the live
  source frame.
- **Rendering performance.** The playhead stays in its own store. Thumbnails use a
  dedicated off-screen video and an LRU cache. Backdrops (including grain) are cached per
  size and style.

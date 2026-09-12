# Multiple Scenes — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Today the app renders exactly one hardcoded on-screen layout: `app.component.ts`
builds a single flat Pixi `Container` by hand (one `Timer`, three `BoxedText`s
wired directly in code), and camera video is never composited into that
canvas at all — recording/streaming uses a raw camera `MediaStream` directly.

This spec defines "multiple scenes": the ability to build several named,
reusable graphics+camera layouts (e.g. "Main Scoreboard", "Halftime Stats",
"Player Intro"), switch between them live with a crossfade, and preview the
next one before cutting to it — similar in spirit to a scene switcher like
OBS, scoped to what this app actually needs.

## Scope decisions

These were settled during design and shape everything below:

- A **scene** includes both the camera composition (which source(s), what
  layout) and the graphics overlay — not graphics alone.
- Camera video is composited **inside Pixi** (video texture → `Sprite`), not
  as separate DOM `<video>` layers — this keeps camera + overlay as one
  render tree, which is what makes a single composited output stream
  (recording/streaming) straightforward.
- Scenes are authored with a **free-form builder** (drag/resize layers
  anywhere), not fixed templates.
- Scene switches support a **crossfade transition**, not just a hard cut.
- Scenes are **global, reusable presets** — not tied to a specific
  game/event.
- The app has **Preview and Program monitors** (two live Pixi renderers):
  stage the next scene in Preview, then Cut or Transition it into Program.

## 1. Data model & camera abstraction

```ts
interface SceneConfig {
  id: string;
  name: string;
  version: number;
  layers: SceneLayer[];
}

type SceneLayer = CameraLayer | WidgetLayer;

interface LayerBase {
  id: string;
  x: number; y: number; width: number; height: number; zIndex: number;
}

interface CameraLayer extends LayerBase {
  type: 'camera';
  slot: string;       // e.g. 'cam1' — NOT a literal deviceId
  fit: 'cover' | 'contain';
}

interface WidgetLayer extends LayerBase {
  type: 'widget';
  widgetType: string;  // key into the widget registry
  props: Record<string, unknown>;
}
```

Because scenes are global reusable presets, they can't hard-reference a
specific camera's `deviceId` — available devices differ per venue/event.
Scenes instead reference logical **slots** (`cam1`, `cam2`, …). A separate
per-broadcast-session mapping (set up when going live, outside the scene
config itself) assigns actual `MediaStream`s to slots. This is what lets a
"2-camera split" scene be reused across different games without editing it.

## 2. Rendering architecture, video compositing, widget registry

A single `SceneRenderer` function/class does the actual work: given a
`SceneConfig`, a slot→`MediaStream` map, and a target Pixi `Container`, it
builds/updates one Pixi `Sprite` per layer in `zIndex` order. This is the
*only* place scene layout becomes pixels — the builder, Preview monitor, and
Program monitor are all just separate callers of it against their own
container.

- **Camera layers**: each active slot gets one hidden `<video>` element
  (`srcObject = stream`, `.play()`), wrapped once in a Pixi `Texture`
  (`Texture.from(videoEl)`). That texture is shared — if the same camera
  appears in the builder, Preview, and Program simultaneously, it's still
  decoded once; each view gets its own `Sprite` pointing at the shared
  texture, sized/cropped per `fit`.
- **Widget layers**: a `WidgetRegistry: Record<widgetType, (props) => Sprite>`
  maps `widgetType` strings to factory functions. Existing entities
  (`BoxedText`, `AsyncText`, and future widgets from the separate "more
  widgets" roadmap item) register themselves here. New widgets become new
  registry entries — `SceneRenderer` never needs to change for them.

This replaces today's hardcoded construction in `app.component.ts` with
data-driven layer instantiation from a `SceneConfig`.

## 3. Scene builder (editor mode)

The builder is a third consumer of `SceneRenderer`, pointed at its own Pixi
`Renderer`/canvas — not a separate rendering path. On top of the normal
render, each layer's `Sprite` gets `eventMode = 'static'` and pointer
handlers:

- **Drag body** → updates `x`/`y` on the layer.
- **Drag a corner handle** (drawn when a layer is selected) → updates
  `width`/`height`.
- No rotation, no free anchors, no grouping — a deliberate scope limit; the
  current widget set doesn't need them.

A side palette lets the user add a layer: an empty **camera slot**
placeholder (set `fit`, leave `slot` to be resolved at broadcast time) or a
**widget** picked from the `WidgetRegistry`. Edits mutate the in-memory
`SceneConfig` directly; since `SceneRenderer` is pure (config → Pixi tree),
the canvas re-renders on every change with no separate editor-state to keep
in sync.

**Snap/dock while dragging**: candidate snap lines are computed from the
canvas edges, the canvas's horizontal/vertical center, and the edges/centers
of other layers in the scene. When a dragged edge comes within a small pixel
threshold of a candidate line, it snaps and a thin guide line is drawn for
feedback. This is independent of the existing `entities/docked.ts`
`createGridLayout` mechanism (which auto-arranges a fixed 2D array every
tick) — that stays as-is for anything still using it. The editor's snapping
is drag-time assistance on otherwise freely-positioned layers, not a layout
engine.

## 4. Preview/Program monitors & crossfade

Two independent Pixi `Renderer`s, each backed by its own `SceneRenderer`
instance:

- **Program** — whatever `SceneConfig` is currently live; its canvas's
  `captureStream()` is what feeds `RecordService`/ffmpeg (replacing the raw
  camera stream used today).
- **Preview** — the `SceneConfig` staged to go live next, shown but not fed
  to output.

A **Cut** button instantly swaps which `SceneConfig` id Program points to. A
**Transition** button runs a crossfade: the incoming scene's container is
added to the Program stage on top of the outgoing one, its `alpha` tweened
0→1 (outgoing tweened 1→0) over a fixed duration (e.g. 500ms), then the
outgoing container is torn down. Both scenes' camera textures and widget
tickers are fully live for that brief window — acceptable since it's bounded
to the transition duration, not sustained.

## 5. Persistence & output integration

- **Persistence**: `SceneConfig[]` saved as one array under a single
  `app-store` key (`scenes`) via the existing `AppStoreService`.
  `electron-store` already supports arbitrary nested JSON, so no
  schema/migration system is needed beyond the `version` field on the saved
  shape. This is also the first real consumer of `AppStoreService.get()`, so
  its existing bug (missing `return` on the underlying call,
  `src/app/services/app-store/app-store.service.ts:8-18`) needs fixing as
  part of this work.
- **Output integration**: `RecordService` switches from taking a raw camera
  `MediaStream` to taking the Program canvas's `captureStream()`. This is
  the one point where the new scene system touches the existing recording
  pipeline; `AudioService`'s mixed audio track continues to be attached
  exactly as it is today, unaffected by the video-side change.

## 6. Testing approach

Pixi pixel output isn't practically unit-testable, so tests focus on the
logic around it: `SceneConfig` CRUD (add/move/resize layer, snap-target
calculation as pure functions), `WidgetRegistry` registration/lookup,
`AppStoreService` persistence (including the `get()` fix), and
`SceneRenderer`'s layer-diffing logic (given a config, does it produce the
expected set of Sprites) — using Jest with mocked Pixi objects, consistent
with the existing `record.service.spec.ts` style.

## Relationship to other future-plans items

- **Pre-game/in-game split view**: the Preview/Program monitors and scene
  picker belong in the in-game view; the scene builder likely belongs in the
  pre-game view (or a dedicated settings area).
- **More widgets**: each new widget is a new `WidgetRegistry` entry: no
  changes to this design are needed to add one.
- **Pre-built graphical suites**: a "suite" can be modeled as a bundle of
  `SceneConfig`s shipped as defaults/importable presets, reusing this same
  data model.
- **Standardized in-game messages**: likely its own `widgetType` (or a small
  family of them) in the registry, not a separate mechanism.

# Hidden Production Window — Design Spec

Status: proposed, ready for implementation planning

## Purpose

Today the recording/streaming pipeline is disconnected pieces, not a working
whole: `PreGameComponent` shows a raw, un-composited camera `<video>` preview
(`src/app/views/pre-game/pre-game.component.ts`); `AppComponent`'s Pixi canvas
(`src/app/app.component.ts:49-87`) renders a scoreboard demo with no camera
input at all; and `RecordService.setVideoStream()`
(`src/app/services/record/record.service.ts:21-31`), which would feed the
existing `ffmpeg:*` IPC pipeline, is never actually called from the UI.

This spec wires those pieces together, but deliberately **not** in the
operator's main window. The actual camera+overlay compositing that becomes
the recorded/streamed output runs in a separate, hidden `BrowserWindow`,
isolated from the main window's UI thread. The main window only ever shows a
live preview of that output — it is not itself a recording source.

## Scope decisions

These were settled during design and shape everything below:

- The **hidden window is the sole owner of camera capture and compositing.**
  It is the only process that ever calls `getUserMedia`, the only one that
  builds the camera+overlay Pixi composite, and the only one whose canvas
  feeds `RecordService`/ffmpeg. This sidesteps having to test whether a given
  camera/driver tolerates two concurrent opens.
- The main window's preview is a **WebRTC loopback of the hidden window's
  already-composited canvas stream** — a local `RTCPeerConnection` pair,
  signaled through the main process over IPC (no STUN/TURN; same-machine
  loopback candidates only) — not a periodic snapshot relay and not an
  independent second Pixi render. The main window just plays the proxied
  stream in a plain `<video>` element: genuinely the same pixels being
  recorded, passed through one extra real-time encode/decode hop for
  transport. Any latency/quality cost from that hop lands on the preview
  only; it never touches what's actually recorded or streamed.
- This is a **minimal single-camera + overlay composite**, built now so
  recording actually works, not gated on the full scene system. It **extends**
  `multiple-scenes-design.md` rather than replacing it: that spec's planned
  "Program" renderer is what ends up living in this hidden window, and its
  `SceneRenderer`/`SceneConfig` model can layer on top of the compositing
  component described here later without changing the window/process
  boundary this spec establishes. Until that lands, the hidden window
  composites exactly one camera slot plus the existing hardcoded overlay
  widgets (`Timer`, `BoxedText`, `createGridLayout`) — the same widgets
  `AppComponent` builds today.
- **Target resolution is a persisted setting**, not hardcoded and not derived
  from the camera's native mode — configured in `PreGameComponent` alongside
  the existing camera picker, stored via `AppStoreService` the same way
  `selectedCameraDeviceId` is today.
- The hidden window is created when the operator **enters the in-game view**
  (so the preview is live before they hit "record") and torn down when they
  leave it or the app quits — not kept running for the lifetime of the app,
  since it holds the camera open and runs a live encode.

## 1. Window & process architecture

`electron/main.ts` currently creates one `BrowserWindow` (lines 16-24). This
adds a second, created on demand rather than at launch:

```ts
function createProductionWindow(resolution: {width: number; height: number}, cameraDeviceId: string) {
  const win = new BrowserWindow({
    width: resolution.width,
    height: resolution.height,
    show: false,
    webPreferences: {
      preload: pathJoin(import.meta.dirname, './preload.js'),
      backgroundThrottling: false, // keep rendering at full rate while hidden
    },
  });
  const query = `window=production&resWidth=${resolution.width}&resHeight=${resolution.height}&cameraId=${cameraDeviceId}`;
  if (process.env['NODE_ENV'] === 'dev') {
    win.loadURL(`http://localhost:4200?${query}`);
  } else {
    win.loadFile(pathJoin(import.meta.dirname, '../app/index.html'), { search: query });
  }
  return win;
}
```

`backgroundThrottling: false` is the load-bearing option here: without it,
Chromium throttles rendering in windows that aren't visible, which is exactly
the failure mode a hidden window doing real recording work can't tolerate.

Target resolution and the selected camera's `deviceId` are read from
`AppStore` (main process already owns this instance, `electron/app-store.ts`)
and passed as URL query params at window-creation time — a one-shot config
handoff, not a runtime channel.

Both windows load the same built Angular bundle. Since `AppComponent` is the
app's root component (mounted at `<app-root>` in `index.html`), it can't be
bypassed by routing alone. `AppComponent`'s template branches on the
`window=production` query flag (read once at startup) to decide what to
render:

- **absent** (main window): today's shell — the persistent canvas region,
  nav tabs, and `<router-outlet>` for `/pre-game` and `/in-game`.
- **`production`**: nothing but a bare `<router-outlet>`, routed to a new
  `/production` route rendering the compositing component described below.
  No nav chrome, no side panel.

## 2. Compositing & recording (hidden window)

A new standalone component (e.g. `src/app/views/production/`) does the work
`AppComponent` does today, minus the demo-only text form control, plus a
camera layer:

- Reads `cameraId` and `resWidth`/`resHeight` from the query string, calls
  `getUserMedia({ video: { deviceId: cameraId, width: resWidth, height:
  resHeight } })`.
- Creates a hidden `<video>` element bound to that stream, wraps it once via
  `Texture.from(videoEl)`, and adds a full-canvas `Sprite` as the base layer.
- Builds the existing overlay on top exactly as `app.component.ts:60-84` does
  today (`Timer`, `BoxedText`s, `createGridLayout`) — moved here verbatim,
  not redesigned.
- `pixiApp.init({ width: resWidth, height: resHeight, ... })` — sized to the
  configured target resolution instead of the current hardcoded 640×480.
- Drives the same manual `requestAnimationFrame` render loop as today
  (`animate()`, `app.component.ts:96-101`).
- On init, calls `RecordService.setVideoStream(pixiApp.canvas.captureStream())`
  — this is the first real call site `RecordService` has ever had.
  `RecordService`'s existing audio-attach, chunking, and `window.recordApi`
  start/stop/sendChunk logic (`record.service.ts:21-58`) needs no changes.
- Also opens a second `captureStream()` off the same canvas (cheap — it's
  just another consumer of the same `HTMLCanvasElement`) to feed the WebRTC
  preview proxy described next.

`AudioService` (currently injected by `RecordService`) also runs in this
window, since this is where recording actually happens; the main window has
no need for it.

## 3. Preview proxy (WebRTC loopback)

A small new module, e.g. `src/app/services/preview-proxy/`, with a
window-role-specific half in each of the two Angular contexts:

- **Hidden window (sender)**: on init, creates an `RTCPeerConnection`, adds
  the second `captureStream()`'s tracks, creates an offer, and sends it out
  via a new IPC channel (`production:signal`, hidden→main relay). Applies
  whatever answer/ICE candidates come back on the same channel.
- **Main window (receiver)**: on entering `/in-game`, creates its own
  `RTCPeerConnection`, listens for `production:signal` messages relayed from
  the hidden window, answers the offer, and on `ontrack` assigns the
  resulting `MediaStream` to a `<video autoplay>` element's `srcObject`. That
  element is the operator's live preview.
- The main process (`electron/main.ts` or a new
  `electron/production-window/signal-relay.ts`) does no signaling logic
  itself — it only forwards `production:signal` payloads between the two
  `webContents`, the same "dumb pipe" role it already plays for
  `ffmpeg:video-chunk`.
- Since both peers are on the same machine, only `host` ICE candidates are
  ever produced/needed — no STUN/TURN server, no network config.

## 4. IPC surface additions

New channel constants (mirroring `electron/ffmpeg-runner/messages.ts`'s
pattern), in a new `electron/production-window/messages.ts`:

- `SIGNAL = 'production:signal'` — bidirectional relay of SDP/ICE payloads,
  tagged with a `from: 'hidden' | 'main'` field so `main.ts` knows which
  `webContents` to forward to.
- `ERROR = 'production:error'` — hidden→main, carries a message when
  `getUserMedia` or Pixi init fails in the hidden window.
- `CLOSED = 'production:closed'` — main process→main window, pushed when the
  hidden `BrowserWindow`'s `closed` event fires unexpectedly (crash, or the
  user closed it directly via task manager) so the UI can react.

`preload.ts` gains a `window.productionApi` bridge (`sendSignal`,
`onSignal`, `onError`, `onClosed`), typed in `src/renderer.d.ts`, following
the existing `recordApi` shape.

## 5. Settings

`PreGameComponent` gains a resolution picker next to the existing camera
picker (`pre-game.component.ts:30-39` shows the pattern to follow): a fixed
list of presets (720p / 1080p / 4K) persisted under a new `AppStoreService`
key, `productionResolution: {width, height}`, defaulting to 1080p if unset.

## 6. Lifecycle & error handling

- **Creation**: entering `/in-game` (main window) sends an IPC request to
  spawn the hidden window if one doesn't already exist, passing the current
  `productionResolution`/`selectedCameraDeviceId` settings.
- **Teardown**: leaving `/in-game`, or app quit, closes the hidden window.
  Recording in progress should be stopped first (`RecordService.stop()`)
  rather than yanked out from under ffmpeg.
- **Camera/init failure**: caught in the hidden window's compositing
  component, sent via `production:error`; the main window surfaces it as a
  visible banner instead of silently showing a black/frozen preview.
- **Unexpected hidden-window closure**: `main.ts` listens for the `closed`
  event; on an unrequested close it pushes `production:closed` so the main
  window disables Start/Stop Recording controls and prompts the operator to
  re-enter the in-game view (which respawns the hidden window).
- **ffmpeg spawn failure**: unchanged — already surfaced via the existing
  `invoke`/await on `ffmpeg:start` (`record.service.ts:38-48`).

## 7. Testing approach

Consistent with the existing split between Jest-testable logic and
manually-verified Pixi/media output:

- New Jest specs for the main-process relay logic (`production:signal`
  forwarding, hidden-window creation/teardown), following
  `electron/ffmpeg-runner/ffmpeg-runner.spec.ts`'s style.
- Component/service specs for the new production compositing component's
  non-Pixi logic (query-param parsing, `RecordService.setVideoStream` being
  called with the composited stream) and for the preview-proxy's signaling
  state machine, with `RTCPeerConnection`/Pixi mocked.
- `RecordService` itself needs no new tests beyond what exists
  (`record.service.spec.ts`) — its contract (accepts a `MediaStream`) is
  unchanged; only who calls it changes.
- Manual verification: `npm start`, pick a camera and resolution in
  pre-game, enter in-game, confirm the preview `<video>` shows the live
  composited overlay, start recording, confirm the output file matches the
  configured resolution and contains the overlay burned in.

## Relationship to other future-plans items

- **Multiple scenes** (`multiple-scenes-design.md`): this spec's hidden
  window is where that spec's "Program" renderer ends up living; its
  `SceneConfig`/`SceneRenderer`/widget registry can replace this spec's
  hardcoded overlay-building step without touching the window/process
  boundary or the WebRTC preview proxy. Its "Preview monitor" (staging the
  *next* scene before cutting) is a separate concern from this spec's
  preview (a live mirror of the *current* output) — both can coexist once
  scenes land.
- **Pre-game/in-game split**: this spec assumes and builds on that existing
  split — the hidden window's lifecycle is tied to the in-game view, and the
  resolution setting belongs in the pre-game view alongside the camera
  picker.
- **Multi-platform streaming**: unaffected — ffmpeg's `tee` muxer already
  fans the same encoded stream out to multiple destinations
  (`electron/ffmpeg-runner/build-args.ts`); this spec only changes what feeds
  ffmpeg's stdin, not what ffmpeg does with it.

# Video File Source — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Adds the ability to use a pre-recorded video file (a sponsor break, a team
intro, any pre-produced clip) as a source alongside live cameras. This is
one of two specs covering "videos/replays as a video source" from
CLAUDE.md's future plans — this one covers pre-recorded file playback.
Instant replay (a rolling buffer of recent live footage, played back on
demand) is intentionally a separate, harder follow-up spec that builds on
this one's mechanism.

## Scope decisions

These were settled during design and shape everything below:

- Playback is **explicitly cued and triggered** by the operator (a Play
  button), not passively looping whenever its scene is visible — matching
  how these clips are actually used in a broadcast (a deliberate sponsor
  break or team intro moment, not background content).
- A video file source is modeled as a **third origin on the existing
  `SlotSource` abstraction** from `2026-09-13-remote-media-contribution-design.md`
  (`'local' | 'remote' | 'file'`) — reusing the same mechanism that already
  lets `SceneRenderer` stay agnostic to where a slot's `MediaStream` comes
  from, rather than inventing a parallel "video layer" concept.
- "Return to previous scene when the video ends" operates at the **scene**
  level, reusing the multiple-scenes spec's existing cut mechanism, rather
  than adding new revert semantics to the slot system itself — matching
  the realistic pattern of a dedicated cutaway scene (e.g. "Sponsor Break")
  rather than a video blended into a live multi-camera layout.

## 1. Video file source & slot integration

```ts
type SlotSource =
  | { slot: string; origin: 'local'; stream: MediaStream }
  | { slot: string; origin: 'remote'; stream: MediaStream; participantId: string }
  | { slot: string; origin: 'file'; stream: MediaStream; sourceId: string };
```

```ts
interface VideoFileSource {
  id: string;
  label: string;
  filePath: string;
  onEnd: 'freeze' | 'loop' | 'return-to-previous';
}

class VideoFilePlayer {
  readonly stream: MediaStream;          // videoEl.captureStream()
  readonly state$: Observable<'cued' | 'playing' | 'paused' | 'ended'>;

  play(): void { /* ... */ }
  pause(): void { /* ... */ }
  seek(seconds: number): void { /* ... */ }
}
```

A `VideoFilePlayer` wraps a hidden `HTMLVideoElement` (`src` pointed at the
local file) and exposes its `captureStream()` output the same way a camera
or remote WebRTC stream does — once assigned to a slot, `SceneRenderer`
(`2026-09-13-multiple-scenes-design.md`) needs no changes at all, the same
way remote camera contribution needed none.

## 2. Cue, trigger, and auto-return behavior

Loading a file creates a `VideoFilePlayer` in `'cued'` state (loaded,
paused at frame 0) but not yet assigned live anywhere. The operator hits
Play when it's needed.

For `onEnd: 'return-to-previous'`, the scene controller (already tracking
the currently-live scene id per the multiple-scenes spec) also remembers
the *previous* one. When a video's `onEnd` fires and it's set to
`'return-to-previous'`, the controller calls
`sceneController.cut(previousSceneId)` — the exact same `cut()` the
operator would use manually, just triggered automatically. `'freeze'`
leaves the last frame showing (video paused, not removed); `'loop'`
restarts playback (`videoEl.loop = true`).

## 3. File library & in-game controls

Loading a file uses Electron's native file picker, following the existing
IPC pattern from `electron/preload.ts` (per CLAUDE.md's "new
renderer↔main capability" convention: add the channel, handle it in main,
expose it via `contextBridge`, type it in `src/renderer.d.ts`):

```ts
// electron/main.ts (or a small new video-library module)
ipcMain.handle('video:select-file', async () => {
  const result = await dialog.showOpenDialog({ filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }] });
  return result.canceled ? null : result.filePaths[0];
});
```

```ts
// electron/preload.ts
contextBridge.exposeInMainWorld('videoApi', {
  selectFile: (): Promise<string | null> => ipcRenderer.invoke('video:select-file'),
});
```

A "Video Sources" section is added to the in-game panel (alongside
Scenes/Messages/Widgets from `2026-09-13-pregame-ingame-split-design.md`):
"Add Video" calls `window.videoApi.selectFile()`, creates a
`VideoFileSource` + `VideoFilePlayer`, and lists it with a Play/Pause/seek
scrubber, an `onEnd` selector, and a slot-assignment dropdown (the same UI
pattern as the remote-camera slot assignment from the remote-media
spec).

## 4. Testing approach

- `VideoFilePlayer` — state transitions (`cued` → `playing` →
  `paused`/`ended`), mocking `HTMLVideoElement`/`captureStream()`.
- Auto-return behavior — given `onEnd: 'return-to-previous'` and a mocked
  `sceneController`, asserts `cut(previousSceneId)` is called exactly once
  when playback ends.
- Slot assignment — a `SlotSource` with `origin: 'file'` resolves the same
  way as `'local'`/`'remote'` (reusing the remote-media-contribution
  spec's existing slot tests as a pattern).
- No real video decoding/rendering test — browser-dependent, consistent
  with the rest of the project.

## Relationship to other future-plans items

- **Multiple scenes**: video sources are just another `SlotSource` origin
  — no changes needed to `SceneRenderer`.
- **Remote media contribution**: shares the exact same slot-abstraction
  mechanism, just a third origin alongside local/remote.
- **Instant replay**: a natural follow-up spec — reuses this spec's
  `VideoFilePlayer`/slot-assignment mechanism, but the "file" is a rolling
  capture buffer instead of a pre-loaded file.

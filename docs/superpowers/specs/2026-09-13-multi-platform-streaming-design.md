# Multi-Platform Streaming — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Today `FFmpegRunner` only supports local recording, and even that path is
incomplete: `start()` declares `...args: string[]` but is invoked over IPC
with a single `options` object (`electron/ffmpeg-runner/ffmpeg-runner.ts:15-22`),
so no real ffmpeg command has ever been built from it. This spec adds
simultaneous streaming to YouTube/Facebook/Twitch/Instagram (and local
recording) by finishing that pipeline properly, generalized to an arbitrary
list of destinations instead of the two hardcoded booleans hinted at by the
existing unused `FFmpegOptions { youtubeStream, localRecord }` interface.

## Scope decisions

These were settled during design and shape everything below:

- Platform connection is **generic RTMP + stream key** (like OBS), not
  official per-platform OAuth/APIs. No app registration with
  Google/Meta/Twitch, no OAuth flows to build or maintain. This also
  sidesteps Instagram's restrictive official Live API — a plain RTMPS URL
  + key from Instagram/Facebook Live Producer works fine through a generic
  pipeline.
- **Simulcast**: multiple destinations (any mix of platforms + local
  recording) run simultaneously from one live encode, via ffmpeg's `tee`
  muxer — not one-at-a-time.
- Stream keys are stored **in plaintext** via the existing
  `AppStoreService`, same as every other persisted setting — no new
  encryption infrastructure for v1. This matches the local-desktop-app
  threat model and how most streaming software behaves by default.
- `MediaRecorder` currently outputs VP9/webm
  (`src/app/services/record/record.service.ts:23`), but every RTMP
  ingest requires H.264 + AAC — so a live transcode is unavoidable
  regardless of approach; this design produces **one** H.264/AAC encode and
  fans it out, rather than re-encoding per destination.

## 1. Destination data model & platform presets

```ts
type DestinationType = 'local' | 'rtmp';

interface StreamDestination {
  id: string;
  type: DestinationType;
  label: string;
  enabled: boolean;
  rtmpBaseUrl?: string;   // rtmp-only
  streamKey?: string;     // rtmp-only
  filePath?: string;      // local-only
}

const PlatformPresets: Record<string, { label: string; rtmpBaseUrl?: string }> = {
  youtube:  { label: 'YouTube', rtmpBaseUrl: 'rtmp://a.rtmp.youtube.com/live2' },
  twitch:   { label: 'Twitch',  rtmpBaseUrl: 'rtmp://live.twitch.tv/app' },
  facebook: { label: 'Facebook', rtmpBaseUrl: 'rtmps://live-api-s.facebook.com:443/rtmp' },
  instagram:{ label: 'Instagram' },  // no stable base URL — Instagram/Facebook
                                      // Live Producer issues a fresh RTMPS URL
                                      // per broadcast, so this preset just
                                      // pre-labels the entry; the operator
                                      // pastes both fields fresh each time
};
```

YouTube/Twitch/Facebook have stable, well-known ingest base URLs, so their
presets pre-fill `rtmpBaseUrl` — the operator only pastes their stream key.
Instagram doesn't work that way, so its preset is just a labeled empty
entry filled in completely each session. This is why the generic-RTMP
approach was chosen over per-platform APIs: it absorbs this kind of
platform inconsistency without needing Instagram-specific integration code.

## 2. FFmpeg pipeline — single encode, tee fan-out

```ts
function buildFFmpegArgs(destinations: StreamDestination[]): string[] {
  const branches = destinations
    .filter((d) => d.enabled)
    .map((d) =>
      d.type === 'local'
        ? `[f=mp4]${d.filePath}`
        : `[f=flv:onfail=ignore]${d.rtmpBaseUrl}/${d.streamKey}`
    )
    .join('|');

  return [
    '-f', 'webm', '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac',
    '-f', 'tee', '-map', '0:v', '-map', '0:a',
    branches,
  ];
}
```

One `libx264`/`aac` encode is produced from the incoming VP9/webm input,
then ffmpeg's `tee` muxer fans the same encoded packets out to every
enabled destination — a local `.mp4` and/or any number of RTMP targets —
without re-encoding per destination. `onfail=ignore` on each RTMP branch
means one platform's dropped connection doesn't take down local recording
or the other platforms.

`FFmpegRunner.start()` (`electron/ffmpeg-runner/ffmpeg-runner.ts`) is
rewritten to call `buildFFmpegArgs(destinations)` and spawn with the result,
replacing the current broken `...args: string[]` passthrough.

## 3. UI integration & persistence

**Configuring destinations** (pre-game): a new "Streaming Destinations"
subsection under `PreGameComponent`'s Settings
(`2026-09-13-pregame-ingame-split-design.md`), alongside the camera/mic
pickers — add a destination by picking a platform preset or "Custom
RTMP"/"Local file", fill in the key/path, toggle it enabled. Persists as
`StreamDestination[]` via `AppStoreService` (key `streamDestinations`),
same mechanism as every other spec's persisted config (and depends on the
same `AppStoreService.get()` bug fix,
`src/app/services/app-store/app-store.service.ts:8-18`).

**Starting/stopping** (in-game): `RecordService` changes minimally —
instead of `mediaRecorder.start = () => window.recordApi.start()`
(`record.service.ts:24`, no args today), it becomes
`mediaRecorder.start = () => window.recordApi.start(this.destinations.getEnabled())`,
reading the persisted, enabled destination list at start time. A "Go Live"
control in the in-game panel calls `RecordService.start()` exactly as
today — no new start/stop concept, just real destinations flowing through
the existing call.

## 4. Testing approach

- `buildFFmpegArgs` — pure function: given a `StreamDestination[]`, assert
  the exact arg array (tee branch string, `onfail=ignore` placement, local
  vs rtmp branch format). This is the core logic and fully unit-testable
  without spawning ffmpeg.
- `RecordService` — extend the existing `record.service.spec.ts` pattern to
  assert `window.recordApi.start` is called with the enabled-destinations
  array.
- `PlatformPresets` — lookup correctness (each preset's `rtmpBaseUrl` or
  lack thereof for Instagram).
- No integration test against real ffmpeg or real platform ingest,
  consistent with the project having no e2e suite today.

## Relationship to other future-plans items

- **Pre-game/in-game split view**: fills the "Streaming Destinations"
  settings subsection and the in-game "Go Live" control into that shell.
- **Multiple scenes**: once built, the Program monitor's `captureStream()`
  becomes the video source fed into this same pipeline, replacing whatever
  raw stream feeds it today — no changes needed to `buildFFmpegArgs` or the
  tee fan-out itself.

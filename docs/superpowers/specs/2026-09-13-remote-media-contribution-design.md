# Remote Media Contribution — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

`2026-09-13-multi-user-roles-design.md` covers remote *control* (triggering
existing actions from another device) but explicitly excludes remote
*media* — a participant's camera or microphone actually becoming part of
the broadcast. This spec covers that half: remote camera contribution
(e.g. a second camera operator at another location) and remote commentary
(audio-only), both via WebRTC, building directly on the roles spec's
session and capability model.

## Scope decisions

These were settled during design and shape everything below:

- **Signaling reuses the roles spec's Supabase Realtime channel** — no
  second relay system. WebRTC offer/answer/ICE messages ride the same
  per-session channel as `RemoteCommand` messages, distinguished by
  message type.
- **TURN relay is self-hosted (coturn)**, not a third-party service — the
  one genuine new always-on server this spec requires, accepted as the
  cost of avoiding per-GB vendor pricing for media relay. Short-lived
  credentials are minted via a Supabase Edge Function rather than a
  custom backend, keeping everything else serverless.
- **Star topology, not mesh**: each media-contributing participant opens
  one `RTCPeerConnection` directly to the host. Contributors never connect
  to each other — only the host needs to receive and composite media,
  consistent with the roles spec's decision to keep compositing host-local
  (server-side compositing was investigated there and explicitly
  deferred).
- Remote camera streams resolve into the **same `slot → MediaStream`
  mechanism** the multiple-scenes spec already defined for local cameras —
  no changes needed to `SceneRenderer` itself.
- Remote commentary extends `AudioService`'s **existing per-device gain
  mixing** — a remote audio track is just another entry in the same
  `gains` map, not a separate audio pipeline.

## 1. Signaling & ICE

```ts
type SignalingMessage =
  | { type: 'webrtc-offer'; participantId: string; sdp: string }
  | { type: 'webrtc-answer'; participantId: string; sdp: string }
  | { type: 'webrtc-ice-candidate'; participantId: string; candidate: RTCIceCandidateInit };
```

```ts
const iceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },  // free public STUN — handles most direct P2P
  { urls: 'turn:turn.<yourdomain>:3478', username, credential },  // self-hosted coturn fallback
];
```

Coturn needs short-lived credentials rather than a static secret baked into
the client — a Supabase Edge Function (`mint-turn-credentials`) computes
time-limited HMAC credentials against coturn's shared secret on request,
checking the caller holds `contribute-camera` or `contribute-audio` first.
This keeps the "no custom always-on Node server" property from the roles
spec for everything except coturn itself.

## 2. Peer topology

A star: each media-contributing participant opens exactly one
`RTCPeerConnection` directly to the host's Electron app. Contributors never
connect to each other — only the host needs to receive and composite
media.

## 3. New capabilities & camera slot resolution

```ts
// extends the roles spec's Capability union
type Capability = /* ...existing five... */ | 'contribute-camera' | 'contribute-audio';
```

```ts
interface SlotSource {
  slot: string;
  origin: 'local' | 'remote';
  stream: MediaStream;
  participantId?: string;  // set when origin === 'remote'
}
```

The host maintains a `slot → SlotSource` map. When a contributor's
`RTCPeerConnection.ontrack` fires, the host assigns that `MediaStream` to
whichever slot the operator designates for that participant (a dropdown in
the participant list: "Remote Cam A → cam2"). `SceneRenderer`
(`2026-09-13-multiple-scenes-design.md`) doesn't change — it already
consumes a plain `slot → MediaStream` map and doesn't care whether a
stream originated from local `getUserMedia` or a remote peer connection.
This is exactly why that spec abstracted camera slots away from literal
`deviceId`s in the first place.

## 4. Remote commentary — extending AudioService

A remote audio-only contributor's WebRTC audio track becomes just another
entry in `AudioService`'s existing `gains: {[deviceId]: {gainNode, label}}`
map (`src/app/services/audio/audio.service.ts:10`), keyed by
`participant:<id>` instead of a local device ID, connected into the same
`mixedAudioNode` via
`audioCtx.createMediaStreamSource(remoteStream).connect(gainNode)`. From
the pre-game Settings gain-slider UI, a remote commentator's audio just
shows up as one more slider — no special-casing, same mixing architecture,
different track origin.

## 5. UI

**Host** (extends the "Remote Collaborators" list from the roles spec): a
participant granted `contribute-camera` gets a slot-assignment dropdown
once their stream connects; one granted `contribute-audio` gets a gain
slider identical to the local mic sliders in pre-game Settings.

**Remote participant**: the browser prompts for camera/mic permission only
when the host has granted the matching capability; the `RTCPeerConnection`
negotiates automatically over the signaling channel once granted, with a
simple "You're contributing camera + mic" status shown to the contributor.

## 6. Testing approach

- `SlotSource` assignment — given an incoming remote stream and an
  operator-chosen slot, asserts the `slot → SlotSource` map updates
  correctly (mocking `RTCPeerConnection`).
- `mint-turn-credentials` — HMAC credential computation correctness, a pure
  function test.
- `AudioService`'s remote-track mixing — extends the existing gain-wiring
  test pattern, mocking `AudioContext`/`MediaStream` the same way
  `audio.service.spec.ts` already does for local devices.
- No real WebRTC negotiation or coturn integration testing — browser/
  network-dependent, consistent with the project having no e2e suite
  today.

## Relationship to other future-plans items

- **Multi-user roles & remote control**: this spec's parent — reuses its
  session, signaling channel, and capability enforcement wholesale, just
  adding two new capabilities and a media layer on top.
- **Multiple scenes**: remote camera streams resolve into the exact same
  `slot → MediaStream` mechanism as local cameras — no changes to
  `SceneRenderer`.
- **Pre-game/in-game split view**: remote commentary shows up in the
  existing Settings audio-mixing UI unchanged.

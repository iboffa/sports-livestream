# Multi-User Roles & Remote Control — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Today the app is single-user and single-process: one operator, one Electron
instance, everything local. This spec lets multiple collaborators join a
single broadcast remotely — a director selecting scenes, a scoreboard
operator, a messages operator, etc. — each restricted to a flexible,
host-assigned set of capabilities, without needing to be on the same
network as the host.

This is one of two specs covering "multi-user collaboration on a single
broadcast" from CLAUDE.md's future plans. It covers **remote control**
(triggering existing actions like scene cuts, message triggers, and
scoreboard start/stop from another device). **Remote media contribution**
(a participant's camera/mic actually becoming part of the broadcast, which
needs WebRTC rather than lightweight message relay) is intentionally a
separate, not-yet-designed spec that builds on this one's session model.

## Scope decisions

These were settled during design and shape everything below:

- Split from remote media contribution: this spec only relays small JSON
  control commands, never audio/video — no WebRTC, no STUN/TURN, no NAT
  traversal concerns.
- Remote collaborators can join from **genuinely different networks**, not
  just the same LAN — this requires the project's first backend
  component, since nothing in this repo talks to a server today.
- That backend need is met with **Supabase Realtime** (already configured
  as an available service in this environment) rather than a self-hosted
  relay server — a Broadcast channel per session for command relay,
  Presence for connection tracking, and Postgres tables for session and
  participant state. A small statically-hosted Angular app (Vercel/Netlify/
  Cloudflare Pages — trivial and effectively free for an SPA) serves as the
  actual remote-control web client, since Supabase itself doesn't do static
  hosting.
- A remote collaborator can join as either a **plain web browser** (no
  install) or the **same Electron app running in a "remote mode"** — both
  load the identical hosted web client; Electron's remote mode just points
  a `BrowserWindow` at that URL instead of building a second client.
- **Capabilities are flexible, not fixed roles**: `RolePreset`s are a
  convenience for quickly assigning a starting capability set, but the
  host can add/remove individual capabilities per participant afterward.
  No participant is locked into one of a few named roles.
- **Server-side video compositing was investigated and explicitly
  deferred.** It's feasible (a headless-Chromium approach, the same
  technique products like StreamYard/Restream Studio use, would run the
  existing Pixi/Angular code unchanged) but is a major infrastructure and
  ongoing-cost commitment — cloud compute per active broadcast, likely
  GPU-backed, plus a media server to ingest participant feeds. This spec
  keeps the host-local compositing model every other spec already assumes;
  revisiting that is a separate, bigger future decision.

## 1. Infrastructure

- **Control relay**: a Supabase Realtime Broadcast channel per session
  (channel name = session id). The host and any authorized participant
  publish/subscribe to it — the low-latency pipe for commands like "cut to
  scene 2." Presence tracks who's currently connected, feeding the host's
  participant list.
- **Session/participant state**: two Postgres tables via Supabase —
  `broadcast_sessions` (id, created_at, status) and `session_participants`
  (id, session_id, display_name, capabilities jsonb, connection_state).
- **Remote-control web client**: a small, separately hosted Angular app
  (not part of the Electron renderer bundle) that a collaborator's browser
  loads via the join link.

## 2. Roles & capabilities model

```ts
type Capability =
  | 'control-scenes'
  | 'control-scoreboard'
  | 'control-messages'
  | 'control-widgets'
  | 'manage-participants';

interface Participant {
  id: string;
  displayName: string;
  capabilities: Capability[];
  connectionState: 'connected' | 'disconnected';
}

interface RolePreset {
  name: string;
  capabilities: Capability[];
}

const RolePresets: RolePreset[] = [
  { name: 'Director', capabilities: ['control-scenes', 'manage-participants'] },
  { name: 'Scoreboard Operator', capabilities: ['control-scoreboard'] },
  { name: 'Messages Operator', capabilities: ['control-messages'] },
];
```

The host always implicitly holds every capability. `RolePreset`s speed up
assigning a participant's starting set; individual capabilities can be
toggled per participant afterward.

## 3. Command relay & host-side enforcement

```ts
type RemoteCommand =
  | { type: 'cut-scene'; sceneId: string }
  | { type: 'transition-scene'; sceneId: string }
  | { type: 'trigger-message'; messageType: string; data: Record<string, string | number> }
  | { type: 'timer-start' }
  | { type: 'timer-stop' };

const CommandCapabilityMap: Record<RemoteCommand['type'], Capability> = {
  'cut-scene': 'control-scenes',
  'transition-scene': 'control-scenes',
  'trigger-message': 'control-messages',
  'timer-start': 'control-scoreboard',
  'timer-stop': 'control-scoreboard',
};
```

A host-side `RemoteControlGateway` subscribes to the session's Supabase
Realtime channel. On each incoming `{ participantId, command }` message, it
looks up that participant's current `capabilities` from the host-held
Postgres record — **never trusting a capability claim sent by the client
itself**, since a compromised or buggy remote client could otherwise claim
any permission — checks `CommandCapabilityMap[command.type]` is included,
and if authorized dispatches to the same local service the in-app UI
already calls: `sceneController.cut(sceneId)`
(`2026-09-13-multiple-scenes-design.md`), `queueController.trigger(...)`
(`2026-09-13-standardized-messages-design.md`), `timer.start()`/`stop()`
(`src/app/entities/timer.ts`). Remote control isn't a parallel system; it's
the existing local actions, gated by capability and reachable over the
relay channel.

## 4. Join flow & UI

**Host side** (a new "Remote Collaborators" section in `PreGameComponent`,
`2026-09-13-pregame-ingame-split-design.md`): "Start Remote Session"
creates a `broadcast_sessions` row and a join link
(`https://<hosted-remote-client>/join/<sessionId>`), shown as a link + QR
code. As participants connect (via Supabase anonymous auth — no account
system needed for v1, just a display name), they appear in a list where
the host assigns a `RolePreset` or toggles individual capabilities
directly.

**Remote side**: the hosted web app at the join link prompts for a display
name, connects (anonymous Supabase auth + subscribes to the session
channel), and shows only the controls its current capability set unlocks —
e.g. a participant with only `control-messages` sees just the message
trigger panel from the standardized-messages spec, reusing that spec's UI.
The Electron "remote mode" is the same page loaded in a `BrowserWindow`
instead of a plain browser tab.

## 5. Testing approach

- `CommandCapabilityMap` coverage — every `RemoteCommand` type maps to
  exactly one capability; a pure lookup test.
- `RemoteControlGateway` — given a participant's capabilities and an
  incoming command, asserts authorized commands dispatch to the right
  local service call and unauthorized ones are rejected without side
  effects (mocking the Supabase channel and the local services).
- `RolePreset` application — assigning a preset produces the expected
  capability set.
- No integration test against real Supabase infrastructure, consistent
  with the project having no e2e suite today.

## Relationship to other future-plans items

- **Multiple scenes / standardized in-game messages**: remote commands
  dispatch directly into those specs' existing controllers — no duplicate
  logic.
- **Pre-game/in-game split view**: hosts the "Remote Collaborators"
  section in the pre-game settings area.
- **Remote media contribution** (camera/commentary): a separate,
  not-yet-designed spec that builds on this one's session/participant
  model, adding WebRTC media on top of the same Supabase-brokered session.
- **Server-side compositing**: investigated but explicitly deferred (see
  Scope decisions above) — a bigger future decision, not part of this
  design.

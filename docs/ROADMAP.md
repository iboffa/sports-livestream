# Feature Roadmap

Last updated: 2026-09-14

This orders the "Future plans" items from `CLAUDE.md` into phases, sequenced
by dependency and biased toward finishing the core recording/streaming
pipeline before adding operator-facing features on top of it. Written for a
solo developer over a several-month horizon.

Each phase links to its design spec under `docs/superpowers/specs/` where one
exists; implementation plans live under `docs/superpowers/plans/`.

## Phase 0 — Pre-Game/In-Game Split *(done)*

Spec: `docs/superpowers/specs/2026-09-13-pregame-ingame-split-design.md`
Plan: `docs/superpowers/plans/2026-09-14-pregame-ingame-split-plan.md`

All seven tasks are complete: app-store fix, in-game panel, pre-game shell,
routed layout beside the persistent canvas, camera picker, mic-gain sliders,
and `RecordService` → `inject()`.

## Phase 1 — Hidden Production Window

Spec: `docs/superpowers/specs/2026-09-14-hidden-production-window-design.md`
(status: ready for implementation planning)

Wires the currently disconnected pieces — `PreGameComponent`'s raw camera
preview, `AppComponent`'s Pixi canvas, and `RecordService`/the `ffmpeg:*` IPC
pipeline — into one real compositing + recording pipeline. This is the
biggest structural gap in the app today: nothing downstream can be built on
a real "camera + graphics, composited, recorded" flow until this exists.

## Phase 2 — Multiple Scenes

Spec: `docs/superpowers/specs/2026-09-13-multiple-scenes-design.md`

Generalizes the single hardcoded layout into named, switchable scenes
(crossfade, preview-before-cut), building on Phase 1's compositor. Scenes
become the shared abstraction that widgets, messages, video sources, and
graphical suites all assume exists.

## Phase 3 — Operator-facing overlay features

Can be built in either order once Phase 2 lands; both extend the scene
model rather than depending on each other.

- **More Widgets** — `docs/superpowers/specs/2026-09-13-more-widgets-design.md`
  (starting lines, game intro, ranking, stats)
- **Standardized In-Game Messages** — `docs/superpowers/specs/2026-09-13-standardized-messages-design.md`
  (yellow/red card, timeout, substitution, goal — quick-action panel)

## Phase 4 — Video File Source

Spec: `docs/superpowers/specs/2026-09-13-video-file-source-design.md`

Pre-recorded clips (sponsor break, team intro) as a source alongside live
cameras, reusing the source/scene abstraction from Phase 2. Instant replay
is an intentionally separate, harder follow-up not covered by this spec.

## Phase 5 — Multi-Platform Streaming

Spec: `docs/superpowers/specs/2026-09-13-multi-platform-streaming-design.md`

Generalizes Phase 1's ffmpeg pipeline from local-only recording to
simultaneous streaming across an arbitrary list of destinations
(YouTube/Facebook/Twitch/Instagram). Deferred until the single-destination
pipeline from Phase 1 is proven, not multiplied before it's trusted.

## Phase 6 — Pre-Built Graphical Suites

Spec: `docs/superpowers/specs/2026-09-13-graphical-suites-design.md`

Developer-authored theme bundles (shared visual style + starter
scenes/widgets) an operator can apply as a set. Pure polish on top of
Phases 2–3; not worth building before scenes and widgets exist to theme.

## Phase 7 — Multi-User Roles & Remote Control

Spec: `docs/superpowers/specs/2026-09-13-multi-user-roles-design.md`

The biggest net-new subsystem: networking, auth, and a per-user capability
model so collaborators (director, scoreboard operator, messages operator,
remote camera operator) can join a broadcast remotely. Deliberately last
among single-user work — it's additive to everything above, not a
dependency of it.

## Phase 8 — Remote Media Contribution

Spec: `docs/superpowers/specs/2026-09-13-remote-media-contribution-design.md`

Remote camera and audio-only commentary contribution via WebRTC. Depends
directly on Phase 7's session/capability model, so it follows immediately
after.

## Already resolved

- **Version upgrade** (Angular/Electron/pixi.js to latest majors) — done,
  see `docs/superpowers/specs/2026-09-12-version-upgrade-design.md` and
  `docs/superpowers/plans/2026-09-12-version-upgrade-plan.md`.
- **Pre-Game/In-Game split** — done, see Phase 0 above.

## Revisiting this roadmap

Re-sequence if priorities change (e.g. pulling Multi-Platform Streaming or
Multi-User Roles earlier for a specific event), and update "Last updated"
when phases complete or the order changes.

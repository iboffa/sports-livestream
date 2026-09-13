# Pre-Game / In-Game Split View — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Today the app is a single unrouted screen (`AppComponent`) that doubles as a
scratch area for the Pixi overlay demo. This spec restructures the UI into
two views — pre-game (settings, rosters, information) and in-game (camera,
scene selection, scoreboard, messages) — that an operator can freely switch
between, including mid-broadcast, without disrupting the live canvas or
camera/mic streams.

## Scope decisions

These were settled during design and shape everything below:

- This spec covers the **navigation/layout shell only**. Roster/team data
  modeling is not designed here — it becomes its own future-plans item.
  Rosters and Information are placeholder panels in this design.
- Pre-game and in-game are **freely navigable** at any time, not a one-way
  "Go Live" gate — e.g. an operator can check the roster mid-game.
- Navigation is implemented with **Angular Router** (routes already
  partially wired: `provideRouter(routes)` in `main.ts` with an empty
  `routes` array, and `RouterModule` imported but unused in
  `app.component.ts`).
- The Pixi canvas and camera/mic streams stay **persistent in
  `AppComponent`**, not behind a route — only a side panel is routed. This
  avoids tearing down and reinitializing the canvas and re-acquiring
  device streams every time the operator navigates away and back.
- Since `AudioService`/`VideoService` already exist but have no UI, this
  restructuring is used to finally wire up a **real settings panel** for
  device selection — not left as a placeholder like rosters/information.

## 1. Layout & routing structure

`AppComponent`'s template gets a persistent full-canvas area (today's
existing Pixi renderer/stage/`animate()` loop moves here essentially
unchanged) plus a side-panel region containing a `<router-outlet>`, and a
small nav control (two tabs, "Pre-Game" / "In-Game") calling
`router.navigate(['/pre-game'])` / `['/in-game']`.

```ts
// app.routes.ts
export const routes: Routes = [
  { path: 'pre-game', component: PreGameComponent },
  { path: 'in-game', component: InGamePanelComponent },
  { path: '', redirectTo: 'pre-game', pathMatch: 'full' },
];
```

`main.ts` already calls `provideRouter(routes)` with an empty array today —
this just populates it. `RouterModule` is already imported in
`AppComponent` but unused; this is what finally uses it.

## 2. Pre-game view — real settings panel

`PreGameComponent` renders three sections: Settings (real), Rosters
(placeholder), Information (placeholder) — only Settings gets built now,
since its backing services already exist.

**Camera**: on init, calls `VideoService.groupCamerasByResolution()` and
renders the grouped devices as a selectable list. Selecting one calls
`getUserMedia({ video: { deviceId } })` and shows a raw `<video>` element as
a self-preview (not routed through Pixi — there's no Pixi consumer for
camera video until the scenes system exists, so this is just "see what you
picked," not live compositing). The chosen `deviceId` persists via
`AppStoreService.set('selectedCameraDeviceId', id)`.

**Audio**: iterates `AudioService.audioInputs` (already populated by the
service's constructor) and renders a gain slider per device. Since
`audioInputs[deviceId].gainNode` is already exposed, the slider writes
directly to `gainNode.gain.value` — no new `AudioService` method needed,
since `AudioParam.value` is natively settable.

**Rosters / Information**: empty "Coming soon" placeholders — these become
their own future-plans items later.

## 3. In-game view — side panel

`InGamePanelComponent` is the routed piece for the in-game side — just
placeholder sections for "Scenes" and "Messages" today, each a "Coming
soon" stub marking where the scenes spec's picker/monitors
(`2026-09-13-multiple-scenes-design.md`) and the messages spec's trigger
panel (`2026-09-13-standardized-messages-design.md`) will eventually mount.
The "camera" and "scoreboard" parts of in-game already exist as the
persistent canvas in `AppComponent` — this component only needs to cover
the two pieces that don't exist yet.

## 4. Persistence

Selected camera/mic device IDs and mic gain values persist via
`AppStoreService` so operators don't reselect devices every session — the
same mechanism (and the same `AppStoreService.get()` bug fix,
`src/app/services/app-store/app-store.service.ts:8-18`) as the other two
specs.

## 5. Testing approach

- `PreGameComponent`/`InGamePanelComponent` as Angular `TestBed` component
  tests, mocking `VideoService`, `AudioService`, `AppStoreService`.
- Route configuration: navigating to `/` redirects to `/pre-game`.
- No new `AudioService`/`VideoService` methods are introduced, so no
  additional service-level tests beyond the shared `AppStoreService.get()`
  fix.

## Relationship to other future-plans items

- **Multiple scenes**: the in-game side panel's "Scenes" section is where
  the scene picker and Preview/Program monitors mount once that system is
  built.
- **Standardized in-game messages**: the in-game side panel's "Messages"
  section is where the trigger panel mounts once that system is built.
- **Rosters / game information**: split out of this spec's scope; becomes
  its own future design when tackled.

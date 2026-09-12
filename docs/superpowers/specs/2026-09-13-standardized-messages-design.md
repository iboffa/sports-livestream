# Standardized In-Game Messages — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

The app currently has no concept of transient, event-driven on-stream
messages. This spec defines a system for firing standardized broadcast
messages during a live game (e.g. "Yellow Card — #7 Smith", "Timeout —
Home", "Substitution", "Goal") from a quick-action panel, with each message
type owning its own visual treatment and timing.

## Scope decisions

These were settled during design and shape everything below:

- Messages are triggered from a **quick-action button panel** (not a
  typed command palette) — fast, low-friction during a live broadcast.
- A triggered message **auto-dismisses** after a timer; the operator
  doesn't manually clear it.
- If a new message fires while one is showing, it's **queued** and plays
  after the current one finishes — never replaces or stacks.
- Each message type gets its **own custom visual layout/animation**, not
  one generic banner styled by data.
- Message types are implemented as **functions, not classes** (no shared
  `MessageWidget` base) — a deliberate deviation from the class-based style
  used elsewhere in `entities/`, chosen for this subsystem specifically.
- *Which* message types are available and how they're labeled is
  **configurable per sport**; the render logic for each type is still code.
- The message layer is an **always-on-top overlay**, independent of the
  scenes system (see `2026-09-13-multiple-scenes-design.md`) — it works
  today, mounted on the current single Pixi stage, and would simply
  reattach above the Program monitor if/when scenes are built.

## 1. Data model & message-type registry

```ts
interface MessageField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  options?: string[];       // for 'select'
  required?: boolean;
}

type MessageRenderFn = (
  data: Record<string, string | number>,
  container: Container,
  durationMs: number,
  onDone: () => void
) => void;

interface MessageTypeDefinition {
  type: string;              // e.g. 'yellow-card'
  label: string;              // default button label
  fields: MessageField[];     // prompted for when triggered
  defaultDurationMs: number;
  render: MessageRenderFn;
}

const MessageTypeRegistry: Record<string, MessageTypeDefinition> = { /* ... */ };
```

`render` is the entire per-type implementation. Given the filled-in field
values and an empty `Container` to build into, it is responsible for the
full lifecycle: play an in-animation, hold for roughly `durationMs`, play
an out-animation, clean up its own children/tickers, and only then call
`onDone()`. This gives each type full creative control over both visuals
and timing — a goal message could pop and hold longer than a quiet
substitution notice.

Built-in types (goal, yellow-card, red-card, substitution, timeout,
player-info) each live in their own file, e.g.
`src/app/messages/types/yellow-card.ts`, registering into the registry.

## 2. Queue controller & render integration

A single `MessageQueueController` processes one message at a time:

```ts
trigger(type: string, data: Record<string, string | number> = {}) {
  queue.push({ def: registry[type], data });
  if (!processing) processNext();
}

private processNext() {
  const next = queue.shift();
  if (!next) { processing = false; return; }
  processing = true;
  const container = new Container();
  overlayLayer.addChild(container);
  next.def.render(next.data, container, next.def.defaultDurationMs, () => {
    overlayLayer.removeChild(container);
    container.destroy({ children: true });
    processNext();
  });
}
```

Because messages are queued rather than replaced/stacked, a burst of events
(a card and a substitution seconds apart) plays out fully, one after
another, instead of clipping or cluttering the screen.

**Render integration**: `overlayLayer` is a single `Container` created once
and added as the last (top-most) child of whatever stage exists today —
`app.component.ts`'s `this.stage.addChild(overlayLayer)`. It does not
depend on the scenes system. If scenes are built later, this same
container reattaches as an always-on-top layer above the Program monitor
rather than becoming a per-scene widget, so it keeps showing correctly
across scene switches instead of disappearing when the scene changes.

## 3. Trigger panel & per-sport configuration

```ts
interface SportMessageProfile {
  sport: string;
  enabledTypes: string[];                    // subset of registry keys
  labelOverrides?: Record<string, string>;   // type -> custom button label
}
```

The trigger panel (a new Angular component) reads the active
`SportMessageProfile`, filters `MessageTypeRegistry` down to
`enabledTypes`, and renders one button per type using
`labelOverrides[type] ?? def.label`. This is what makes it "configurable
per sport": the registry (available types + their render logic) stays
fixed in code, but *which* buttons appear and what they're labeled is data,
editable without a code change.

Clicking a button: if `def.fields.length > 0`, a small inline form prompts
for them (e.g. player number for a card); otherwise it fires immediately.
On submit, it calls `queueController.trigger(type, formValue)`.

`SportMessageProfile[]` persists via the existing `AppStoreService` (key
`messageProfiles`) — the same mechanism used by the scenes spec, and the
same `AppStoreService.get()` bug fix
(`src/app/services/app-store/app-store.service.ts:8-18`, missing `return`)
applies here too; it only needs doing once, whichever feature lands first.

## 4. Testing approach

Pixi animation content isn't practically testable (same reasoning as the
scenes spec), so tests focus on the logic around it:

- `MessageQueueController` sequencing — using a mock `render` fn that calls
  `onDone` on demand, verify messages play strictly one at a time in
  trigger order, and that a second `trigger()` while one is active doesn't
  start immediately.
- `MessageTypeRegistry` lookup/registration.
- `SportMessageProfile` filtering/label-override logic (a pure function,
  testable in isolation).
- `AppStoreService` persistence, including the `get()` fix.

## Relationship to other future-plans items

- **Multiple scenes**: independent of and usable before the scenes system
  exists; once scenes land, the overlay reattaches above the Program
  monitor instead of the current single stage.
- **More widgets**: a distinct mechanism (this is event-driven/transient,
  widgets are persistent scene content) — no overlap expected beyond both
  being Pixi display objects.

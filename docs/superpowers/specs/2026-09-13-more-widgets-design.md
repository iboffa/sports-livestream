# More Widgets — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

The overlay currently has one hardcoded scoreboard layout (`Timer` +
`BoxedText`s wired by hand in `app.component.ts`). This spec adds four new
on-stream widgets — starting lines, game introduction, ranking, stats — and,
along the way, a small shared pattern that removes duplication across them.

## Scope decisions

These were settled during design and shape everything below:

- Widget content is entered via **manual form entry** (like today's
  Reactive Forms text-input demo) — no data-import/roster system exists
  yet, so this doesn't depend on one.
- Since three of the four widgets (starting lines, ranking, stats) are
  structurally the same shape — a table of columns and rows — they're built
  as **one generic, config-driven `DataTable` widget**, not three
  near-duplicate classes. Only "game introduction" needs a distinct
  composition (team name + logo + "VS").
- This is also the point to fix the existing `Ticker.shared` leak
  (`BoxedText`/`createGridLayout` register a redraw callback that's never
  removed on destroy) by introducing a **shared widget lifecycle base**,
  rather than repeating the same leaky pattern four more times.
- Data entry **and** the on/off visibility toggle both live in the in-game
  side panel's new "Widgets" section (alongside the Scenes/Messages
  placeholders from the split-view spec) — not split across pre-game prep
  and in-game toggling.
- **Placement is basic for now**: newly added widgets get a default
  stacked position, not free dragging — real positioning is explicitly the
  scenes builder's job (`2026-09-13-multiple-scenes-design.md`).

## 1. Shared widget lifecycle base

```ts
abstract class DynamicWidget extends Sprite {
  protected constructor() {
    super();
    Ticker.shared.add(this.tick, this);
  }
  protected abstract tick(): void;

  override destroy(options?: DestroyOptions): void {
    Ticker.shared.remove(this.tick, this);
    super.destroy(options);
  }
}
```

Using `Ticker.shared.add(fn, context)` instead of today's anonymous arrow
makes `Ticker.shared.remove(fn, context)` possible in `destroy()`, closing
the leak present in both `BoxedText` and `createGridLayout`
(`src/app/entities/boxed-text.ts:49`, `src/app/entities/docked.ts:6`).
`BoxedText` is refactored to extend `DynamicWidget` (its `draw()` becomes
its `tick()`); `createGridLayout` becomes a small `GridLayout extends
DynamicWidget` class internally, with `createGridLayout(children)` kept as
a thin factory function so existing call sites (`app.component.ts`) don't
change.

While rewriting that Ticker callback anyway, this also fixes the existing
`row[index].height` bug in `docked.ts:15` (indexes by the outer loop
variable instead of the row's own contents) as a drive-by fix.

## 2. Generic DataTable widget

```ts
interface DataTableColumn {
  key: string;
  header?: string;
  textStyle?: Partial<TextStyleOptions>;
  headerBackground?: number;
  cellBackground?: number;
}

interface DataTableOptions {
  columns: DataTableColumn[];
  rows: Record<string, string | number | Observable<string | number>>[];
  showHeader?: boolean;
}

class DataTable extends DynamicWidget {
  constructor(options: DataTableOptions) {
    super();
    // builds an optional header row + one BoxedText-grid row per data row,
    // via createGridLayout
  }
}
```

Each cell value can be a plain value or an `Observable<string | number>` —
reusing `BoxedText`'s existing observable-binding support directly, the
same way today's demo binds a `FormControl.valueChanges`. This means
starting lines, ranking, and stats aren't three widget classes — they're
three different `DataTableOptions` instantiations of one `DataTable`:

- **Starting lines**: `columns: [{key:'number', header:'#'}, {key:'name', header:'Player'}]`
- **Ranking**: `columns: [{key:'rank'}, {key:'team'}, {key:'points'}]`
- **Stats**: `columns: [{key:'label'}, {key:'value'}]`

## 3. Game introduction widget

The one non-tabular case — needs a team logo image, which no existing
entity supports (`BoxedText` is text-only):

```ts
interface ImageBoxOptions {
  texture: Texture;
  background?: number;
  padding?: number;
}

class ImageBox extends DynamicWidget {
  // same box-fit-to-content pattern as BoxedText, wrapping a Sprite(texture)
  // instead of a Text
}

class GameIntroWidget extends DynamicWidget {
  constructor(options: {
    homeTeam: { name: string; logo?: Texture };
    awayTeam: { name: string; logo?: Texture };
  }) {
    super();
    // composes [logo ImageBox?, name BoxedText] per team + a "VS" BoxedText
    // in the middle, via createGridLayout
  }
}
```

Logos come from a local file the operator picks
(`<input type="file" accept="image/*">` in the widget's form →
`Texture.from(URL.createObjectURL(file))`) — no data-import system needed.
`logo` is optional so a text-only intro still works without one.

## 4. Widget catalog & in-game panel integration

```ts
interface WidgetTypeDefinition {
  type: string;
  label: string;
  buildForm(): FormGroup;                     // this widget's editable data
  createInstance(formValue: unknown): DynamicWidget;
}

const WidgetCatalog: Record<string, WidgetTypeDefinition> = {
  'starting-lines': { /* DataTable, columns: #, Player */ },
  'ranking':        { /* DataTable, columns: Rank, Team, Points */ },
  'stats':          { /* DataTable, columns: Label, Value */ },
  'game-intro':     { /* GameIntroWidget */ },
};
```

The in-game panel's "Widgets" section (the third slot alongside
Scenes/Messages from `2026-09-13-pregame-ingame-split-design.md`) lets the
operator pick a type, fill in its `buildForm()` (using `FormArray` for
table row add/remove), and hit "Add to stream" → `createInstance(form.value)`
adds the widget to the persistent canvas. Once added, the widget instance
stays alive in a simple active-widgets list with a show/hide toggle
(`.visible`, not destroy/recreate) and a remove button — toggling preserves
any live-bound observable cells instead of losing state.

**Placement**: since there's no free-positioning system yet, newly added
widgets get simple default positions — stacked/offset from a fixed anchor
(e.g. top-left, next available slot) rather than draggable. Real
positioning is explicitly deferred to the scenes system.

## 5. Testing approach

- `DynamicWidget` — Ticker add/remove on construct/destroy (mocked
  `Ticker.shared`).
- `DataTable` — given columns + rows, produces the expected grid structure
  (row/column counts, header presence).
- `GridLayout`'s row-height fix — a regression test for the corrected
  height calculation.
- `WidgetCatalog` — lookup/registration, and each `buildForm()` produces
  the expected controls.
- No Pixi pixel-output testing, consistent with the other specs.

## Relationship to other future-plans items

- **Multiple scenes**: once built, these widgets become `widgetType`
  entries in that spec's `WidgetRegistry`, reusing the exact same
  `DynamicWidget`-based classes — no rework needed.
- **Pre-game/in-game split view**: fills the "Widgets" slot left as a
  placeholder in the in-game panel.
- **Pre-built graphical suites**: a suite can bundle pre-filled
  `DataTableOptions`/`GameIntroWidget` configs as starting points.

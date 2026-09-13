# Pre-Built Graphical Suites — Design Spec

Status: proposed (future-plans item, not scheduled for immediate implementation)

## Purpose

Today every scene/widget's visual style (colors, fonts, box padding) is
hardcoded per-instance wherever it's constructed (e.g. `background:
0x00000` in `app.component.ts`). This spec defines "graphical suites":
developer-authored bundles of a shared visual theme plus a starter set of
scenes and widgets built with that theme, which an operator can apply as a
set to quickly get a consistent, ready-made on-stream look.

This spec builds directly on top of two other future-plans specs —
`2026-09-13-multiple-scenes-design.md` (scenes, the scene builder) and
`2026-09-13-more-widgets-design.md` (`DataTable`, `GameIntroWidget`, the
widget catalog) — none of which are implemented yet. All three are
designed on paper as future work; this spec assumes their data
model and extends it.

## Scope decisions

These were settled during design and shape everything below:

- A suite is **both** a visual theme (colors/fonts/box style) and a
  content bundle (starter scenes + widget presets) — not either alone.
- **Built-in only for v1**: a small catalog of developer-authored suites
  ships in code. Users pick and apply one; there's no suite-authoring or
  export/import UI. A suite editor is a natural separate future feature,
  not designed here.
- Applying a suite's starter scenes **copies** them into the user's own
  scene list as regular, fully editable entries — not a locked template.
  The operator can rearrange, resize, add, or remove layers afterward
  through the scene builder exactly like any hand-built scene.

## 1. Theme model & theme-token resolution

```ts
interface Theme {
  id: string;
  name: string;
  colors: {
    primary: number;        // main box background
    secondary: number;      // accent background
    text: number;           // text fill color
    textOnPrimary: number;
  };
  font: {
    family: string;
    baseSize: number;
  };
  boxStyle: {
    padding: number;
  };
}

type ThemedColor = 'primary' | 'secondary' | 'text' | 'textOnPrimary' | number; // number = literal override
```

For a suite's theme to actually restyle things, style fields like
`BoxedTextOptions.background` (and the equivalent fields on `DataTable`
columns and `GameIntroWidget`/`ImageBoxOptions` from the more-widgets spec)
change from a raw `number` to `ThemedColor` — either a token name
(`'primary'`) resolved against the active theme, or a literal number as an
escape hatch for one-off overrides. A small `resolveThemeColor(value,
theme)` helper does the lookup at render time.

A `ThemeService` (`providedIn: 'root'`, `activeTheme$: Observable<Theme>`)
holds the currently active theme; widget factories (`DataTable`,
`GameIntroWidget`, `BoxedText` construction sites) read from it when
resolving `ThemedColor` values, so switching the active theme re-styles
both newly created and already-live widgets.

## 2. Suite bundle & how applying one works

```ts
interface GraphicalSuite {
  id: string;
  name: string;
  theme: Theme;
  starterScenes: SceneConfig[];                              // from the scenes spec
  starterWidgets: { type: string; formValue: unknown }[];     // from the more-widgets spec's WidgetCatalog
}
```

Applying a suite does two things:

1. **Theme**: sets it as the active theme via `ThemeService`, immediately
   restyling all live and newly created widgets.
2. **Content**: *copies* `starterScenes` into the user's own persisted
   scene list (not a live reference to the suite) and adds
   `starterWidgets` as quick-add presets in the in-game Widgets panel.

Because the copied scenes become regular entries in the user's own scene
list, they're fully editable afterward through the scene builder from the
multiple-scenes spec — drag, resize, add/remove layers, same as any
hand-built scene. A suite is a starting point, not a locked template:
applying "Classic" seeds a scoreboard layout the operator can then freely
rearrange.

## 3. UI integration & persistence

A "Suites" subsection in `PreGameComponent`'s Settings
(`2026-09-13-pregame-ingame-split-design.md`), alongside device pickers
and streaming destinations, lists the built-in catalog — a handful of
developer-authored suites shipped in code (e.g. "Classic", "Modern Dark",
"High Contrast") — each with a small preview swatch (theme colors + a
thumbnail of its main starter scene). Clicking "Apply" runs the two steps
from section 2.

The active theme persists via `AppStoreService` (key `activeThemeId`) so
it survives app restarts and re-applies on launch; the copied starter
scenes/widgets simply live in the normal scenes/widgets persisted lists
from those specs — no separate suite-tracking state needed once applied,
since they're indistinguishable from any other user-created scene.

## 4. Testing approach

- `resolveThemeColor` — pure function: token → theme value, literal number
  passthrough.
- `ThemeService` — `activeTheme$` emits on `setActive()`.
- Suite application — given a `GraphicalSuite`, asserts the theme is set
  active and `starterScenes`/`starterWidgets` are copied into the
  respective persisted lists (mocking `AppStoreService`).
- Built-in catalog — each shipped suite's `theme`/`starterScenes` shape is
  valid (no missing required fields).

## Relationship to other future-plans items

- **Multiple scenes**: suite theming requires `SceneConfig` layer styles to
  accept `ThemedColor` tokens, not just literals — a small addition to that
  spec's data model when both are implemented together. Applied starter
  scenes are edited via that spec's scene builder.
- **More widgets**: suite theming requires the same `ThemedColor` change in
  `DataTableColumn`/`ImageBoxOptions` style fields; starter widgets become
  entries in that spec's `WidgetCatalog` quick-add flow.
- **Suite authoring/editor**: explicitly out of scope for v1 (built-in
  catalog only) — a natural follow-up feature if wanted later.

# sports-livestream: Angular/Electron/pixi.js version upgrade

Date: 2026-09-12
Status: Approved for planning

## Goal

Bring `sports-livestream` from its current dependency set up to the latest stable majors of Angular, Electron, and pixi.js, plus whatever supporting tooling those upgrades require — **without changing app behavior**. This is a mechanical compatibility upgrade. It is explicitly not the place for stylistic modernization (signals, new control-flow syntax, `inject()`, zoneless change detection) — that is a separate, later effort ("Spec 2") that depends on the APIs this upgrade makes available.

## Current → target versions

| Package | Current | Target | Notes |
|---|---|---|---|
| `@angular/core`, `@angular/cli`, and the rest of the `@angular/*` family | 15.0.x | latest stable major (22.x as of this writing) | via `ng update`, one major at a time |
| `electron` | ^22.0.0 | latest stable (44.x as of this writing) | single jump |
| `electron-builder` | ^23.6.0 | latest (26.x as of this writing) | single jump |
| `electron-store` | ^8.1.0 | latest (11.x as of this writing) | ESM-only since v9 — requires the main-process ESM migration below |
| `pixi.js` | ^7.1.1 | latest v8 (8.x as of this writing) | breaking API changes affecting `entities/` and `app.component.ts` |
| `rxjs`, `zone.js`, `typescript`, `jest`, `jest-preset-angular`, `esbuild` | current `package.json` values | whatever the above require | determined at implementation time from peer-dependency errors, not pre-guessed |

Exact final version numbers are resolved at implementation time (`npm view <pkg> version` / `ng update`'s own resolution) rather than pinned in this spec, since "latest" will have moved on by the time this is implemented.

## Scope

- Upgrade Angular framework + CLI to the latest major, one major version at a time.
- Upgrade Electron and `electron-builder` to latest.
- Migrate the `electron/` main-process build (`esbuild-electron` script) from CommonJS to ESM output — via `.mjs` output extensions on the bundled `main`/`preload` files rather than a project-wide `"type": "module"` in `package.json` (which would also change how Jest and the rest of the Node-based tooling in this package interpret every plain `.js` file, an unnecessary and riskier blast radius for a change that only needs to affect two bundled entry files) — so `electron-store` can move to its latest (ESM-only) major.
- Upgrade `electron-store` to latest, updating `electron/app-store.ts` from `require('electron-store')` to a normal `import`.
- Upgrade `pixi.js` to v8 and fix the resulting compile/runtime breakage in `src/app/entities/async-text-sprite.ts`, `src/app/entities/boxed-text.ts`, `src/app/entities/docked.ts`, and the Pixi setup in `src/app/app.component.ts` — visual output and behavior must remain identical.
- Bump whatever supporting/dev dependencies (`rxjs`, `zone.js`, `typescript`, `jest`, `jest-preset-angular`, `esbuild`) the above require to keep building and testing green.
- Apply only the *required* `ng update` migrations at each Angular major step (whatever a schematic needs to keep the app compiling). Decline optional/stylistic schematics (control-flow syntax, `inject()`, signal-based inputs, standalone-conversion — already standalone) — those belong to Spec 2.

## Out of scope (deferred to Spec 2)

- Converting RxJS observables to signals.
- New control-flow template syntax (`@if`/`@for`).
- `inject()`-based DI.
- Signal-based `input()`/`output()`.
- Zoneless change detection (`provideZonelessChangeDetection()`, dropping `zone.js`).
- The pre-existing oddity in `app.component.ts` where an `Application` is constructed but unused alongside a separately constructed `Renderer`/`Container` that's actually used — left as-is here since untangling it is a design decision, not a version-compat fix. (It will still need to compile under pixi.js v8's API, but its structure won't be changed.)
- Any matchvisio-related work (not part of this project; matchvisio has no custom features worth porting — see prior analysis).

## Sequencing & approach

1. **Angular first.** Its CLI schematics are independent of Electron. Run `ng update @angular/core @angular/cli` one major at a time, from the current major up through each intermediate major to whatever the latest stable major is at implementation time, building and running `npm test` after each step before moving to the next. This makes any breakage traceable to a single major version rather than jumping several majors at once.
2. **Electron + module system second.** Bump `electron` and `electron-builder` to latest in one step (Electron's core APIs used here — `app`, `BrowserWindow`, `ipcMain`, `contextBridge`, `ipcRenderer` — are stable across majors, and Electron has no per-major migration tooling the way Angular does). Then migrate `electron/`'s build to ESM (`esbuild-electron` gets `--format=esm --out-extension:.js=.mjs`, so the bundled main/preload files carry `.mjs` and are ESM regardless of `package.json`'s module type), and upgrade `electron-store` to latest, converting `app-store.ts`'s `require('electron-store')` to `import Store from 'electron-store'`.
3. **pixi.js last.** Independent of the other two; only touches the entities layer and `app.component.ts`.

## Detailed notes per component

### Angular
- Expect `ng update` to prompt for/apply migrations automatically at several majors (e.g., builder consolidation from `browser-esbuild`/`custom-webpack`-style builders to `@angular/build:application`). Accept required migrations; decline optional stylistic ones as noted above.
- `jest` + `jest-preset-angular` will need bumping to versions compatible with whatever Angular major is current at that step — determined by actual peer-dependency resolution, not guessed in advance.
- Karma/Jasmine are not in use here (this project already uses Jest), so no testing-framework migration is needed on that front.

### Electron / ESM migration
- This is the highest-risk step. Electron's support for ESM in the main process and — separately — in **sandboxed preload scripts** has historically varied by version. Validation here means actually launching the app (`npm run electron`), not just a clean `esbuild`/`tsc` pass, to confirm:
  - the main window opens,
  - `AppStore` get/set/delete round-trips through IPC,
  - `FFmpegRunner` still starts/stops correctly.
- `electron-builder.json`'s `main` field and any build config referencing the old CJS output path/extension may need updating to match the new ESM output.

### pixi.js v7 → v8
Known breaking changes affecting this codebase's exact usage:
- `Application` construction becomes async (`await app.init(...)` instead of a synchronous constructor) — affects `app.component.ts`.
- The standalone `Renderer` export used directly in `app.component.ts` is gone in v8 in favor of the app's own internal renderer — `app.component.ts`'s manual `new Renderer(...)` + `new Container()` + `renderer.render(stage)` loop needs to be adapted to v8's renderer API while preserving the same manual `requestAnimationFrame` loop run via `ngZone.runOutsideAngular` (no architectural change here, just API-shape fixes).
- Type names renamed: `ITextStyle` → v8's text-style options type, `IDestroyOptions` → v8's destroy-options type — affects `entities/async-text-sprite.ts` and `entities/boxed-text.ts`.
- `Ticker.shared` is expected to still exist in v8; `entities/boxed-text.ts` and `entities/docked.ts`'s use of it should carry over with minimal changes, but must be verified.
- No visual or behavioral change is in scope here — the overlay must render pixel-identical output (box backgrounds, text, grid layout, timer countdown) before and after.

## Testing / validation strategy

At each step (each Angular major, the Electron+ESM step, the pixi.js step):
1. Build succeeds: `npm run build` (Angular) and/or `npm run esbuild-electron` (main process), as relevant to what changed.
2. `npm test` stays green.
3. Manual smoke test via `npm start`: window opens, Pixi overlay renders (box, timer, name text), start/stop timer buttons work, camera/mic devices enumerate, recording start/stop round-trips to the main process without error.

## Commit strategy

Commit after each Angular major version bump, and after each of the Electron/ESM-migration and pixi.js steps, so any regression is bisectable to a single, small change. (Open question resolved: proceeding with per-step commits rather than a single squashed commit, per the original design proposal — flag now if you'd prefer otherwise before implementation starts.)

## Success criteria

- `package.json` (root and any Electron-side manifest) reflects the latest stable majors of Angular, Electron, electron-builder, electron-store, and pixi.js.
- `npm run build`, `npm test`, and `npm start` all succeed with no behavior or visual regressions versus the pre-upgrade app.
- `electron/app-store.ts` uses a normal ESM `import` for `electron-store` (the CJS `require` workaround is gone).
- No signals, new control-flow syntax, `inject()`, or zoneless changes have been introduced — those remain fully deferred to Spec 2.

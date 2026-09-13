# sports-livestream Version Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `sports-livestream` to the latest stable majors of Angular, Electron, electron-builder, electron-store, and pixi.js, with zero behavior or visual change to the app.

**Architecture:** Sequential, one-dependency-group-at-a-time upgrade: Angular first (one major version per task, via `ng update`), then Electron + electron-builder, then the Electron main-process ESM migration + electron-store, then pixi.js v7→v8. Each task ends with a green build, a green test suite, and its own commit.

**Tech Stack:** Angular, Electron, electron-builder, electron-store, pixi.js, Jest + jest-preset-angular, esbuild, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-12-version-upgrade-design.md`

## Global Constraints

- No signals, no new control-flow template syntax (`@if`/`@for`), no `inject()`-based DI, no signal-based `input()`/`output()`, no zoneless change detection — all deferred to a separate follow-up spec. If any `ng update` schematic offers one of these as an optional migration, decline it.
- No behavior or visual change to the running app. This is a mechanical compatibility upgrade.
- Always pass `--allow-dirty` to `ng update` invocations — the working tree carries an untracked `CLAUDE.md` file from repo setup that does not need to be committed as part of this work.
- Do not force-install `typescript@latest` (currently `7.0.2`, a new major that Angular's compiler-cli is not verified against at time of writing). Let `ng update`'s own dependency resolution choose TypeScript at each step. Only touch the `typescript` version by hand if `npm run build` reports an explicit "TypeScript version mismatch" style error naming a required range — then install the highest version satisfying that range.
- If `npm install`/`npm test` reports a missing or incompatible peer dependency not called out explicitly in a task below, install the latest version of exactly the package named in the error, note it in the task report, and continue — do not guess ahead at dependencies not yet demanded.
- `ng update` may refuse to run at all with an "Incompatible peer dependencies found" error when the currently-installed `jest-preset-angular` doesn't yet support the target Angular major (this is expected at several of the Angular-major tasks below, given jest-preset-angular is only bumped partway through the sequence, not at every step). When this happens, re-run with `--force` added (Angular CLI's own flag, meaning "ignore peer dependency version mismatches" — not the same as `npm install --force`) — this is safe specifically because the task's own next step immediately resolves the named conflict by bumping jest-preset-angular. Note the `--force` use in the task report; it does not need to be treated as an escalation-worthy deviation.
- `tsconfig.json` gained `"skipLibCheck": true` in Task 1 (to resolve `.d.ts`-vs-`.d.ts` conflicts between pixi.js v7's type declarations and TypeScript 5.1's updated DOM lib types — TypeScript's own documented mechanism for this class of conflict, compile-time only, no runtime/behavior effect). This should stay in place through the remaining Angular-major tasks. Once Task 10 upgrades pixi.js to v8 (which should ship `.d.ts` files compatible with modern TypeScript), Task 10's implementer should try removing `skipLibCheck: true` and re-running `npm run build` — if it still succeeds without it, remove it; if removing it surfaces unrelated `.d.ts` conflicts from other dependencies, leave it in place and note which conflicts remain.
- Do not modify anything under `matchvisio/` — this plan is scoped to `sports-livestream` only.
- Do not restructure `src/app/app.component.ts`'s Pixi setup beyond what's needed to compile/run under the new pixi.js major (Task 10) — the existing unused `Application` alongside the manually-driven `Renderer`/`Container` is a known pre-existing oddity, intentionally left alone here.
- Every task ends with a commit. Never use `git commit --amend`.
- Target versions for this plan (verified against the npm registry on 2026-09-12): `@angular/*` families at 16.2.12 → 17.3.12 → 18.2.14 → 19.2.25 → 20.3.31 → 21.2.23 → 22.1.6, `@angular/cli` at the matching 16.2.16 → 17.3.17 → 18.2.21 → 19.2.27 → 20.3.37 → 21.2.24 → 22.1.8, `electron` 44.3.0, `electron-builder` 26.15.3, `electron-store` 11.0.2, `pixi.js` 8.20.1, `jest-preset-angular` 13.1.6 / 14.6.2 / 16.2.0 / 17.0.0 (staged across tasks below), `jest` 29.7.0 then 30.5.1, `jest-environment-jsdom` 30.5.1. If any of these no longer resolve via `npm view <pkg>@<version> version` at implementation time (deprecated/unpublished), use the latest version still satisfying the same major instead.

---

### Task 0: Fix pre-existing baseline test failures

Before any version work starts, `npm test` on this repo already fails 2 of 5 suites (3 of 14 tests), for reasons unrelated to any dependency version:
1. `src/app/services/audio/audio.service.spec.ts` crashes with `ReferenceError: AudioContext is not defined` — `AudioService`'s constructor eagerly does `new AudioContext()`, and jsdom (Jest's DOM emulation) doesn't implement the Web Audio API.
2. `src/app/app.component.spec.ts` (both tests) crash with `Unable to auto-detect a suitable renderer` — `app.component.ts`'s `pixiApp: Application = new Application({...})` field initializer runs pixi.js's WebGL/Canvas renderer detection eagerly, and jsdom has neither. Separately, the second test asserts `.content span` contains `"angular-template app is running!"` — stale boilerplate from the original `ng new` scaffold that doesn't match this app's real template at all.

This task fixes both, in test files only — no production code changes — so every later task in this plan has a real, fully-green baseline to regress against.

**Files:**
- Modify: `src/app/services/audio/audio.service.spec.ts`
- Modify: `src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: repo as of the current HEAD — `npm test` reports 2 failed suites, 3 failed tests, 11 passed, 14 total.
- Produces: `npm test` reports 5 passed suites, 14 passed tests, 0 failed — committed. No production source file changes.

- [ ] **Step 1: Confirm the known failures**

```
npm test
```
Expected: `Test Suites: 2 failed, 3 passed, 5 total` / `Tests: 3 failed, 11 passed, 14 total` — matching the failures described above. If the numbers differ from this, stop and report `NEEDS_CONTEXT` rather than guessing at a fix for a different failure set.

- [ ] **Step 2: Fix `audio.service.spec.ts`**

Replace the full file with:
```typescript
import { TestBed } from '@angular/core/testing';

import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;

  beforeAll(() => {
    (global as any).AudioContext = jest.fn().mockImplementation(() => ({
      currentTime: 0,
      createMediaStreamDestination: jest.fn(() => ({
        stream: { getAudioTracks: () => [] },
        disconnect: jest.fn(),
      })),
      createGain: jest.fn(() => ({
        gain: { setValueAtTime: jest.fn() },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createBiquadFilter: jest.fn(() => ({
        type: '',
        frequency: { value: 0 },
        connect: jest.fn(),
      })),
      createDynamicsCompressor: jest.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: jest.fn(),
      })),
      createMediaStreamSource: jest.fn(() => ({
        connect: jest.fn(),
      })),
    }));

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([]),
        getUserMedia: jest.fn().mockResolvedValue({} as MediaStream),
      },
      configurable: true,
    });
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
```
This mirrors the existing per-file mocking pattern already used in `src/app/services/record/record.service.spec.ts` (which stubs `window.MediaStream`/`window.MediaRecorder` in its own `beforeAll`), rather than introducing a new global stub in `setup-jest.ts` — kept consistent with how this codebase already handles jsdom API gaps.

- [ ] **Step 3: Run just this suite to confirm the fix**

```
npx jest src/app/services/audio/audio.service.spec.ts
```
Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 4: Fix `app.component.spec.ts`**

Replace the full file with:
```typescript
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';

jest.mock('pixi.js', () => {
  const actual = jest.requireActual('pixi.js');
  return {
    ...actual,
    Application: jest.fn().mockImplementation(() => ({})),
    Renderer: jest.fn().mockImplementation(() => ({
      view: document.createElement('canvas'),
      render: jest.fn(),
    })),
  };
});

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the container and controls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input[type="text"]')).toBeTruthy();
  });
});
```
Only `Application` and `Renderer` are replaced with mocks (the two constructors that internally try to detect a WebGL/Canvas context, which jsdom doesn't have) — every other pixi.js export (`Graphics`, `Sprite`, `Ticker`, `Container`, `Text`, `TextStyle`, etc., used internally by `BoxedText`/`createGridLayout`/`Timer`) stays the real implementation via `jest.requireActual`, since those don't need a renderer to construct and aren't what's crashing. The second test's assertion changed from the stale scaffold text to checking for the text input that's actually in `app.component.html`.

- [ ] **Step 5: Run just this suite to confirm the fix**

```
npx jest src/app/app.component.spec.ts
```
Expected: `Tests: 2 passed, 2 total`. If `requestAnimationFrame is not defined` appears (from `app.component.ts`'s own `animate()` loop running during `ngAfterViewInit`), add `global.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;` and `global.cancelAnimationFrame = (id: number) => clearTimeout(id);` to the top of the `beforeEach` block (this jsdom version likely already implements these natively — only add the polyfill if the test actually reports it missing).

- [ ] **Step 6: Full test run**

```
npm test
```
Expected: `Test Suites: 5 passed, 5 total` / `Tests: 14 passed, 14 total`, 0 failed.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "test: fix pre-existing baseline failures in audio and app.component specs"
```

---

### Task 1: Angular 15 → 16

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify (as needed by the schematic): `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `src/main.ts`

**Interfaces:**
- Consumes: repo at Angular 15.0.x, jest-preset-angular 12.2.3, jest 28.1.3 — `npm run build` and `npm test` both green.
- Produces: repo at Angular 16.2.12 / CLI 16.2.16, jest-preset-angular 13.1.6, jest 29.7.0 — `npm run build` and `npm test` both green, committed.

- [ ] **Step 1: Confirm clean starting state**

Run:
```
npm run build
npm test
```
Expected: both succeed. This confirms the pre-upgrade baseline. Record the exact output (pass counts) in the task report.

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@16.2.12 @angular/cli@16.2.16 --allow-dirty
```
Let the schematic apply whatever changes it proposes automatically (these are the *required* migrations for this major — do not separately invoke any `ng generate @angular/core:...` migration schematic).

- [ ] **Step 3: Review the diff**

```
git diff --stat
```
Expected: changes confined to `package.json`, `package-lock.json`, and build-tooling/config files (`angular.json`, `tsconfig*.json`, `src/main.ts`). If the diff touches files under `src/app/entities/`, `src/app/services/`, or changes component template logic beyond mechanical renames, note this explicitly in the task report for the reviewer — it should not happen for a version-only schematic run.

- [ ] **Step 4: Bump jest-preset-angular and jest for Angular 16 compatibility**

The installed jest-preset-angular (12.2.3) does not support Angular 16. Install the minimum compatible versions:
```
npm install --save-dev jest-preset-angular@13.1.6 jest@29.7.0
```

- [ ] **Step 5: Build**

```
npm run build
```
Expected: succeeds with no errors. Fix any compile errors surfaced by Angular 16 API changes (consult the error message and, if available, https://update.angular.io for the 15→16 guide). Do not fix by suppressing type errors (e.g. `any`, `@ts-ignore`) unless the underlying API genuinely no longer exposes the type safely.

- [ ] **Step 6: Test**

```
npm test
```
Expected: all suites pass with the same test count as the Step 1 baseline. If jest fails to start due to a jest-preset-angular/jest peer mismatch not resolved by Step 4, install exactly the package/version named in the error.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 16, jest-preset-angular to 13.1.6"
```

---

### Task 2: Angular 16 → 17

**Files:**
- Modify: `package.json`, `package-lock.json`, and any build-tooling/config files the schematic touches (`angular.json`, `tsconfig*.json`, `src/main.ts`)

**Interfaces:**
- Consumes: repo at Angular 16.2.12, jest-preset-angular 13.1.6, jest 29.7.0 — build/test green (from Task 1).
- Produces: repo at Angular 17.3.12 / CLI 17.3.17, jest-preset-angular unchanged at 13.1.6 (its supported range covers Angular up to <18, so 17 is already covered) — build/test green, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```
Expected: both succeed (continuing from Task 1).

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@17.3.12 @angular/cli@17.3.17 --allow-dirty
```

Angular 17 introduced the consolidated `@angular/build:application` builder as the new default for new projects; `ng update`'s schematic may or may not offer to migrate this project's existing `browser-esbuild` builder automatically. Accept it if offered as part of the standard update schematic (it is a required-for-compatibility change, not a stylistic one) — do not manually invoke a separate opt-in builder-migration schematic beyond what `ng update` itself runs.

- [ ] **Step 3: Review the diff**

```
git diff --stat
```
Same expectation as Task 1 Step 3: changes confined to config/build files, not application logic.

- [ ] **Step 4: Build**

```
npm run build
```
Expected: succeeds. If the build script (`npm run build` → `ng build --base-href=./`) errors because the builder name in `angular.json` changed, adjust the `build`/`serve` script invocations in `package.json` to match (e.g. if `browser-esbuild` was renamed/consolidated), keeping the same script names (`start`, `build`, `electron:dev-start`) and the same observable behavior (dev server on port 4200, prod build to `dist/app`).

- [ ] **Step 5: Test**

```
npm test
```
Expected: same pass count as Task 1's baseline.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 17"
```

---

### Task 3: Angular 17 → 18

**Files:**
- Modify: `package.json`, `package-lock.json`, and any build-tooling/config files the schematic touches

**Interfaces:**
- Consumes: repo at Angular 17.3.12 — build/test green (from Task 2).
- Produces: repo at Angular 18.2.14 / CLI 18.2.21, jest-preset-angular bumped to 14.6.2 (its supported range is Angular >=15 <21, i.e. still would have covered 17, but 13.1.6 tops out at <18 so it must move now) — build/test green, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@18.2.14 @angular/cli@18.2.21 --allow-dirty
```

- [ ] **Step 3: Review the diff**

```
git diff --stat
```
Same expectation as prior tasks.

- [ ] **Step 4: Bump jest-preset-angular**

```
npm install --save-dev jest-preset-angular@14.6.2
```
(jest stays at 29.7.0 — jest-preset-angular 14.6.2 still requires `jest ^29.0.0`.)

- [ ] **Step 5: Build**

```
npm run build
```
Expected: succeeds.

- [ ] **Step 6: Test**

```
npm test
```
Expected: same pass count as baseline.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 18, jest-preset-angular to 14.6.2"
```

---

### Task 4: Angular 18 → 19

**Files:**
- Modify: `package.json`, `package-lock.json`, and any build-tooling/config files the schematic touches

**Interfaces:**
- Consumes: repo at Angular 18.2.14, jest-preset-angular 14.6.2 — build/test green (from Task 3).
- Produces: repo at Angular 19.2.25 / CLI 19.2.27, jest-preset-angular unchanged at 14.6.2 (its range covers Angular up to <21, so 19 is already covered) — build/test green, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@19.2.25 @angular/cli@19.2.27 --allow-dirty
```

- [ ] **Step 3: Review the diff**

```
git diff --stat
```

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Test**

```
npm test
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 19"
```

---

### Task 5: Angular 19 → 20

**Files:**
- Modify: `package.json`, `package-lock.json`, and any build-tooling/config files the schematic touches

**Interfaces:**
- Consumes: repo at Angular 19.2.25, jest-preset-angular 14.6.2 — build/test green (from Task 4).
- Produces: repo at Angular 20.3.31 / CLI 20.3.37, jest-preset-angular unchanged at 14.6.2 (its range covers Angular up to <21, so 20 is already covered) — build/test green, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@20.3.31 @angular/cli@20.3.37 --allow-dirty
```

- [ ] **Step 3: Review the diff**

```
git diff --stat
```

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Test**

```
npm test
```

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 20"
```

---

### Task 6: Angular 20 → 21

**Files:**
- Modify: `package.json`, `package-lock.json`, `setup-jest.ts`, and any build-tooling/config files the schematic touches

**Interfaces:**
- Consumes: repo at Angular 20.3.31, jest-preset-angular 14.6.2, jest 29.7.0 — build/test green (from Task 5). `setup-jest.ts` does `import 'jest-preset-angular/setup-jest';` and `package.json`'s jest config has `"globalSetup": "jest-preset-angular/global-setup"` — both modules are removed as of jest-preset-angular 16.
- Produces: repo at Angular 21.2.23 / CLI 21.2.24, jest-preset-angular 16.2.0, jest 30.5.1, new devDependency `jest-environment-jsdom` 30.5.1, `setup-jest.ts` calling `setupZoneTestEnv()` instead, `globalSetup` removed from the jest config — build/test green, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@21.2.23 @angular/cli@21.2.24 --allow-dirty
```

- [ ] **Step 3: Review the diff**

```
git diff --stat
```

- [ ] **Step 4: Bump jest-preset-angular, jest, and add jest-environment-jsdom**

jest-preset-angular 14.6.2 does not support Angular 21 (its range tops out at <21). The next compatible line (16.2.0) requires `jest ^30.0.0` and an explicit `jest-environment-jsdom` peer dependency (Jest 30 no longer bundles a default DOM environment):
```
npm install --save-dev jest-preset-angular@16.2.0 jest@30.5.1 jest-environment-jsdom@30.5.1
```

- [ ] **Step 5: Update the Jest config for jest-preset-angular 16's removed APIs**

jest-preset-angular 16.2.0 has fully removed two things the current config relies on (confirmed by inspecting the published package contents — this is not a deprecation warning, it's a hard removal that will otherwise fail every test run):
- `jest-preset-angular/global-setup` no longer exists as a module. The preset's own `createCjsPreset()` no longer needs a separate global setup step, so this line is simply obsolete, not replaced by something else.
- `jest-preset-angular/setup-jest` (the module `setup-jest.ts` imports) no longer exists either. It's replaced by an explicit `setupZoneTestEnv()` function from `jest-preset-angular/setup-env/zone`.

Update `package.json`'s `"jest"` block — remove the `globalSetup` line and add an explicit `testEnvironment` (Jest 30 no longer bundles a default DOM environment package, though the preset still defaults the *name* to `'jsdom'`; being explicit here is just defensive):
```json
"jest": {
  "preset": "jest-preset-angular",
  "testEnvironment": "jsdom",
  "setupFilesAfterEnv": [
    "<rootDir>/setup-jest.ts"
  ]
}
```

Update `setup-jest.ts` from:
```typescript
import 'jest-preset-angular/setup-jest';
```
to:
```typescript
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();
```

- [ ] **Step 6: Build**

```
npm run build
```

- [ ] **Step 7: Test**

```
npm test
```
Expected: same pass count as baseline, with the `setup-jest.js` deprecation `console.warn` (present since Task 3) now gone, since `setup-jest.ts` no longer imports the removed module. If a test fails with a DOM-API-related error it didn't before, check whether jsdom 30's stricter DOM implementation is the cause (read the failing test's assertion) and fix the test/source accordingly — do not disable the failing test. If Jest fails immediately with a "Cannot find module" error for `jest-preset-angular/global-setup` or `jest-preset-angular/setup-jest`, confirm Step 5's edits were actually applied and saved.

- [ ] **Step 8: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 21, jest to 30, jest-preset-angular to 16.2.0

Also migrates setup-jest.ts and the jest config off jest-preset-angular's
removed global-setup/setup-jest modules to the new setupZoneTestEnv() API."
```

---

### Task 7: Angular 21 → 22

**Files:**
- Modify: `package.json`, `package-lock.json`, and any build-tooling/config files the schematic touches

**Interfaces:**
- Consumes: repo at Angular 21.2.23, jest-preset-angular 16.2.0, jest 30.5.1 — build/test green (from Task 6).
- Produces: repo at Angular 22.1.6 / CLI 22.1.8 (final Angular target), jest-preset-angular 17.0.0 (final target — covers Angular 20-22) — build/test green, committed. This is the last Angular-version task.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Run the Angular update**

```
npx ng update @angular/core@22.1.6 @angular/cli@22.1.8 --allow-dirty
```

- [ ] **Step 3: Review the diff**

```
git diff --stat
```

- [ ] **Step 4: Bump jest-preset-angular to the latest (final target)**

```
npm install --save-dev jest-preset-angular@17.0.0
```
This requires `typescript >=5.8` — if `npm install` or `npm test` reports a TypeScript version conflict, check the currently installed version (`npm list typescript`) and, only if it is below 5.8, install the highest 5.x version available (do not jump to the TypeScript 7.x line — see Global Constraints).

- [ ] **Step 5: Build**

```
npm run build
```

- [ ] **Step 6: Test**

```
npm test
```
Expected: same pass count as the Task 1 baseline (the count should not have drifted across any of Tasks 1-7).

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "chore: upgrade Angular to 22 (final target), jest-preset-angular to 17.0.0"
```

---

### Task 8: Electron + electron-builder → latest

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: repo at Angular 22.1.6 (all prior tasks complete), electron ^22.0.0, electron-builder ^23.6.0 — build/test green.
- Produces: electron 44.3.0, electron-builder 26.15.3, app still builds and launches with its existing CommonJS electron-process build (the ESM migration is Task 9, not this one) — committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Bump electron and electron-builder**

```
npm install --save-dev electron@44.3.0 electron-builder@26.15.3
```

- [ ] **Step 3: Rebuild the Electron main process bundle**

```
npm run esbuild-electron
```
Expected: succeeds with no esbuild errors (this step doesn't touch Electron APIs, it's a pure bundling step, so it should be unaffected by the version bump — if esbuild itself needs a newer version to run cleanly with the new `electron-builder` types package, `npm view esbuild version` and install the latest as a devDependency).

- [ ] **Step 4: Full build**

```
npm run build
```

- [ ] **Step 5: Launch and smoke-test the app**

```
npm run electron:local
```
This builds production and launches Electron directly against `dist/`. Confirm:
- the process starts without an uncaught exception printed to the terminal (Electron API deprecation warnings are fine; a crash/stack trace is not),
- a window opens.

If running in an environment with an accessible Windows desktop session, capture a screenshot for visual confirmation:
```powershell
Start-Process -FilePath "npm" -ArgumentList "run","electron:local" -PassThru | Out-Null
Start-Sleep -Seconds 8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save("$env:TEMP\task8-electron-smoke.png")
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
```
Read the saved PNG to confirm a window rendered (a white/blank Electron window with the text input and Start/Stop buttons is the expected, pre-existing look — no visual change is expected at this task). If no display session is available in the execution environment, note this in the task report as `DONE_WITH_CONCERNS` and flag that visual confirmation still needs a human or a graphical session.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "chore: upgrade electron to 44 and electron-builder to 26"
```

---

### Task 9: Electron main-process ESM migration + electron-store upgrade

**Files:**
- Modify: `package.json` (script + devDependency changes), `electron/app-store.ts`, `tsconfig.electron.json`

**Interfaces:**
- Consumes: repo at electron 44.3.0 / electron-builder 26.15.3 (from Task 8), `electron/app-store.ts` using `const Store = require('electron-store')`, `esbuild-electron` script producing `dist/electron/main.js` and `dist/electron/preload.js` (CommonJS), electron-store ^8.1.0.
- Produces: `esbuild-electron` producing `dist/electron/main.mjs` and `dist/electron/preload.mjs` (ESM), `electron/app-store.ts` using `import Store from 'electron-store'`, electron-store 11.0.2, all scripts/config referencing the new `.mjs` filenames — build/test green, app launches, committed.

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Update the esbuild-electron script to emit ESM with `.mjs` output**

In `package.json`, change the `esbuild-electron` script from:
```
"esbuild-electron": "esbuild electron/main.ts electron/preload.ts --bundle --minify --outdir=dist/electron --platform=node --packages=external --tree-shaking=true --tsconfig=tsconfig.electron.json"
```
to:
```
"esbuild-electron": "esbuild electron/main.ts electron/preload.ts --bundle --minify --outdir=dist/electron --platform=node --packages=external --tree-shaking=true --tsconfig=tsconfig.electron.json --format=esm --out-extension:.js=.mjs"
```

- [ ] **Step 3: Update every script/config that references the old `.js` output filenames**

In `package.json`, update the `main` field and every script that hardcodes `dist/electron/main.js`:
```json
"main": "electron/main.mjs"
```
```json
"electron:dev-start": "npm run esbuild-electron && wait-on http://localhost:4200 && cross-env NODE_ENV=dev electron ./dist/electron/main.mjs",
"electron": "npm run build && electron ./dist/electron/main.mjs"
```
In `electron/main.ts`, the `preload` path passed to `BrowserWindow`'s `webPreferences` is built with `pathJoin(__dirname, './preload.js')` — update it to `'./preload.mjs'`. Note: `__dirname` is not available in native ESM modules — since esbuild bundles this file, check whether esbuild's ESM output shims `__dirname`/`__filename` automatically for `--platform=node` (it does, via injected helpers, for `--format=esm` bundles). Verify this by building and confirming no `__dirname is not defined` runtime error when the app launches in Step 8; if it does occur, replace `pathJoin(__dirname, './preload.mjs')` with `pathJoin(import.meta.dirname, './preload.mjs')` instead.

- [ ] **Step 4: Update tsconfig.electron.json's module setting**

In `tsconfig.electron.json`, change:
```json
"module": "commonjs",
```
to:
```json
"module": "ES2022",
```
(This keeps the config internally consistent for any IDE/tsc-based type-checking; esbuild's own `--format` flag is what actually controls the bundled output, and was already changed in Step 2.)

- [ ] **Step 5: Upgrade electron-store and convert to a native import**

```
npm install electron-store@11.0.2
```
In `electron/app-store.ts`, replace:
```typescript
// This cannot be converted to an import for how "Store" is defined within electron-store library. It would break esbuild compilation
const Store = require('electron-store');
```
with:
```typescript
import Store from 'electron-store';
```
Remove the now-obsolete comment above it. The rest of `app-store.ts` (the `Options<any>` type import, the `AppStore` class body) is unchanged — electron-store 11's default export is the same `Store` class shape used here (`new Store(options)`, `.get`/`.set`/`.delete`).

- [ ] **Step 6: Add the Node engine requirement**

electron-store 11 requires Node >=20. Add to `package.json`:
```json
"engines": {
  "node": ">=20"
}
```

- [ ] **Step 7: Rebuild the Electron bundle**

```
npm run esbuild-electron
```
Expected: succeeds, and `dist/electron/main.mjs` and `dist/electron/preload.mjs` exist (check with a directory listing) — the old `.js` files should no longer be produced by this script (delete `dist/electron/` first and re-run if stale `.js` files from a previous build are still present, to confirm the new script produces exactly the `.mjs` files).

- [ ] **Step 8: Full build, then launch and smoke-test**

```
npm run build
npm run electron:local
```
This is the highest-risk step in the whole plan: Electron's support for ESM in the main process, and separately in a **sandboxed preload script**, must actually work end-to-end here, not just type-check. Confirm:
- no `ERR_REQUIRE_ESM`, `__dirname is not defined`, or preload-loading error appears in the terminal output,
- the window opens with the same UI as before (text input, Start/Stop buttons),
- click "Start", confirm no error appears (this exercises the preload-exposed `window.recordApi.start()` → `ffmpeg:start` IPC round-trip and the `AppStore`/`electron-store` IPC round-trip is exercised implicitly by the app not crashing on startup, since nothing currently calls `appStore.get/set` from the renderer at startup — if you want an explicit check, open the Electron window's DevTools via `win.webContents.openDevTools()` temporarily added in `main.ts`, and run `window.appStore.set('test', 1); window.appStore.get('test')` in the console, confirming it returns `1` — then revert the temporary DevTools line before committing).

If running in an environment with an accessible Windows desktop session, capture a screenshot for visual confirmation:
```powershell
Start-Process -FilePath "npm" -ArgumentList "run","electron:local" -PassThru | Out-Null
Start-Sleep -Seconds 8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save("$env:TEMP\task9-electron-esm-smoke.png")
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
```
Read the saved PNG to confirm a window rendered (same pre-existing look as before: text input, Start/Stop buttons — no visual change is expected at this task). If no display session is available in the execution environment, note this in the task report as `DONE_WITH_CONCERNS` with the terminal output as evidence, and flag that a human should confirm visually.

- [ ] **Step 9: Test**

```
npm test
```
Expected: unaffected (Jest never touches the `electron/` directory — its `roots`/testMatch, implicit via `jest-preset-angular`'s preset, targets `src/`). Confirm the pass count is unchanged from Task 7's baseline.

- [ ] **Step 10: Commit**

```
git add -A
git commit -m "chore: migrate electron main process to ESM (.mjs), upgrade electron-store to 11"
```

---

### Task 10: pixi.js 7 → 8

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/app/entities/async-text-sprite.ts`, `src/app/entities/boxed-text.ts`, `src/app/entities/docked.ts`, `src/app/app.component.ts`, `src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: repo at pixi.js ^7.1.1, all prior tasks complete — build/test green, app launches. `src/app/app.component.spec.ts` carries the `jest.mock('pixi.js', ...)` added in Task 0, shaped for `Application` as a bare mocked object and a separately-mocked `Renderer`.
- Produces: pixi.js 8.20.1, all five files updated to compile and render identically under v8 — build/test green, app launches with the same visual overlay (box, timer, name text, grid layout), committed. The spec's mock is updated to match the new `Application.init()`/`.canvas` usage (Step 7).

- [ ] **Step 1: Confirm clean starting state**

```
npm run build
npm test
```

- [ ] **Step 2: Bump pixi.js**

```
npm install pixi.js@8.20.1
```

- [ ] **Step 3: Fix `src/app/entities/async-text-sprite.ts`**

Current code:
```typescript
import { ICanvas, IDestroyOptions, ITextStyle, Text, TextStyle } from 'pixi.js';
import { Observable, Subscription } from 'rxjs';

export class AsyncText extends Text {
  asyncText: Observable<string | number>;
  textSub: Subscription;
  constructor(
    text: Observable<string|number>,
    style?: Partial<ITextStyle> | TextStyle,
    canvas?: ICanvas
  ) {
    super('', style, canvas);
    this.asyncText = text;
    this.textSub = text.subscribe((t) => (this.text = t));
  }

  override destroy(options?: boolean | IDestroyOptions | undefined): void {
    this.textSub.unsubscribe();
    super.destroy(options);
  }
}
```
In pixi.js v8, `Text`'s constructor takes a single options object (`new Text({ text, style })`) rather than positional `(text, style, canvas)` arguments, `ITextStyle` is replaced by `TextStyleOptions`, `IDestroyOptions` is replaced by `DestroyOptions`, and the separate `ICanvas` type is gone (canvas selection is handled internally). Rewrite as:
```typescript
import { DestroyOptions, Text, TextStyle, TextStyleOptions } from 'pixi.js';
import { Observable, Subscription } from 'rxjs';

export class AsyncText extends Text {
  asyncText: Observable<string | number>;
  textSub: Subscription;
  constructor(
    text: Observable<string | number>,
    style?: Partial<TextStyleOptions> | TextStyle
  ) {
    super({ text: '', style });
    this.asyncText = text;
    this.textSub = text.subscribe((t) => (this.text = String(t)));
  }

  override destroy(options?: DestroyOptions): void {
    this.textSub.unsubscribe();
    super.destroy(options);
  }
}
```
(`this.text` on a v8 `Text` is typed as `string`, so the `Observable<string | number>` value is coerced with `String(t)` to match — this preserves the existing behavior of both string and numeric values being displayable.)

- [ ] **Step 4: Fix `src/app/entities/boxed-text.ts`**

Current code:
```typescript
import {
  Graphics,
  IDestroyOptions,
  ITextStyle,
  Sprite,
  Text,
  TextStyle,
  Ticker,
} from 'pixi.js';
import { Observable, Subscription } from 'rxjs';
import { AsyncText } from './async-text-sprite';

export interface BoxedTextOptions {
  text: string | number | Observable<string | number>;
  background: number;
  padding?: number;
  minWidth?: number;
  textStyle?: Partial<ITextStyle>;
  colspan?: number;
}

export class BoxedText extends Sprite {
  private _text: Text | AsyncText;
  private _box: Graphics;
  private _options: BoxedTextOptions;
  private _textSub!: Subscription;

  override get width() {
    return this._box.width;
  }

  override get height() {
    return this._box.height;
  }

  constructor(options: BoxedTextOptions) {
    super();

    this._options = options;
    if (!options.colspan) {
      this._options.colspan = 1;
    }
    this._text =
      this._options.text instanceof Observable
        ? new AsyncText(this._options.text)
        : new Text();
    this._box = new Graphics();


    Ticker.shared.add(()=> this.draw())

    this.addChild(this._box);
    this.addChild(this._text);

    if (this._text instanceof AsyncText) {
      this._textSub = this._text.asyncText.subscribe((text) => {
        this.updateText(text)
      });
    }
  }

  update(options: Partial<BoxedTextOptions>) {
    this._options = { ...this._options, ...options };
  }

  updateText(text: string|number) {
    this.update({ text });
  }

  private draw() {
    this._box.clear();
    const padding = this._options.padding ?? 0;
    if (!(this._options.text instanceof Observable))
      this._text.text = this._options.text;
    if (this._options.textStyle)
      this._text.style = new TextStyle(this._options.textStyle);

    this._box.beginFill(this._options.background);
    const width = Math.max(this._options.minWidth ?? 0, this._text.width + 2 * padding);
    console.log(width);
    this._box.drawRect(0, 0, width, this._text.height + 2 * padding);
    this._box.endFill();
    this.centerText();
  }

  override destroy(options?: boolean | IDestroyOptions | undefined): void {
    this._textSub?.unsubscribe();
  }

  private centerText() {
    const diffX = this._box.width / 2 - this._text.width / 2;
    const diffY = this._box.height / 2 - this._text.height / 2;

    this._text.x = diffX;
    this._text.y = diffY;
  }
}
```
v8 changes needed: `ITextStyle` → `TextStyleOptions`; `IDestroyOptions` → `DestroyOptions`; `Text` needs the options-object constructor (`new Text({ style })`); `Graphics`'s fill/draw API changed from the imperative `beginFill()`/`drawRect()`/`endFill()` sequence to a chained `.rect(x, y, w, h).fill(color)` call. Rewrite as:
```typescript
import {
  DestroyOptions,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  TextStyleOptions,
  Ticker,
} from 'pixi.js';
import { Observable, Subscription } from 'rxjs';
import { AsyncText } from './async-text-sprite';

export interface BoxedTextOptions {
  text: string | number | Observable<string | number>;
  background: number;
  padding?: number;
  minWidth?: number;
  textStyle?: Partial<TextStyleOptions>;
  colspan?: number;
}

export class BoxedText extends Sprite {
  private _text: Text | AsyncText;
  private _box: Graphics;
  private _options: BoxedTextOptions;
  private _textSub!: Subscription;

  override get width() {
    return this._box.width;
  }

  override get height() {
    return this._box.height;
  }

  constructor(options: BoxedTextOptions) {
    super();

    this._options = options;
    if (!options.colspan) {
      this._options.colspan = 1;
    }
    this._text =
      this._options.text instanceof Observable
        ? new AsyncText(this._options.text)
        : new Text({ style: this._options.textStyle });
    this._box = new Graphics();

    Ticker.shared.add(() => this.draw());

    this.addChild(this._box);
    this.addChild(this._text);

    if (this._text instanceof AsyncText) {
      this._textSub = this._text.asyncText.subscribe((text) => {
        this.updateText(text);
      });
    }
  }

  update(options: Partial<BoxedTextOptions>) {
    this._options = { ...this._options, ...options };
  }

  updateText(text: string | number) {
    this.update({ text });
  }

  private draw() {
    this._box.clear();
    const padding = this._options.padding ?? 0;
    if (!(this._options.text instanceof Observable))
      this._text.text = String(this._options.text);
    if (this._options.textStyle)
      this._text.style = new TextStyle(this._options.textStyle);

    const width = Math.max(this._options.minWidth ?? 0, this._text.width + 2 * padding);
    this._box.rect(0, 0, width, this._text.height + 2 * padding).fill(this._options.background);
    this.centerText();
  }

  override destroy(options?: DestroyOptions): void {
    this._textSub?.unsubscribe();
    super.destroy(options);
  }

  private centerText() {
    const diffX = this._box.width / 2 - this._text.width / 2;
    const diffY = this._box.height / 2 - this._text.height / 2;

    this._text.x = diffX;
    this._text.y = diffY;
  }
}
```
One behavior-preserving fix bundled in here (required just to compile/run correctly under v8, not a stylistic change): `super.destroy(options)` was missing from the original `destroy()` override (a pre-existing bug — the base `Sprite`/`Container` cleanup never ran). Call this out explicitly in the task report since it's a behavior change (albeit a bug fix, not a feature change) beyond pure version compatibility. (Note: the `instanceof Observable<string | number>` → `instanceof Observable` fix shown above was already made in Task 1, Step 5, as an unavoidable fix for a TypeScript 5.1 compile error introduced by the Angular 16 upgrade — by this task, the file should already read `instanceof Observable` with no generic argument at both call sites. If it doesn't for some reason, apply the same fix here.)

- [ ] **Step 5: Fix `src/app/entities/docked.ts`**

Current code uses `Sprite`, `Container`, `Ticker` — none of these names changed in v8, so this file's imports are unaffected. Read the file to confirm it still compiles after `npm install pixi.js@8.20.1` (Step 2) and the `BoxedText`/`AsyncText` changes above; no source changes are expected here unless the build (Step 7) reports otherwise.

- [ ] **Step 6: Fix the Pixi setup in `src/app/app.component.ts`**

Current relevant code:
```typescript
import { Application, Renderer, Container, Text, TextStyle } from 'pixi.js';
...
  pixiApp: Application = new Application({
    width: 640,
    height: 480,
    antialias: true
  });
  private renderer!: Renderer;
  private stage!: Container;
  ...
  ngAfterViewInit() {
    this.renderer = new Renderer({
      width: 640,
      height: 480,
      backgroundColor: 0xffffff,
    });
    this.stage = new Container();
    this.container.nativeElement.appendChild(this.renderer.view);

    const timeBox = new BoxedText({
      text: this.timer$,
      minWidth: new Text('188:88', {fontSize:14}).width,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });
    const testName = new BoxedText({
      // @ts-ignore
      text: this.textContent.valueChanges.pipe(startWith(this.textContent.value!)) as Observable<string>,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });

    const testName2 = new BoxedText({
      text: 'Test',
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });

    const block = createGridLayout([[timeBox, testName, testName2]]);
    this.stage.addChild(block);

    this.ngZone.runOutsideAngular(() => this.animate());
  }
  ...
  private animate() {
    this.renderer.render(this.stage);
    requestAnimationFrame(() => this.animate());
  }
```
v8 removes the standalone `Renderer` export used here; `Application` construction is now async (`await app.init(...)`); and `Text`'s constructor no longer takes positional `(text, style)` arguments — it takes a single options object, so the `new Text('188:88', {fontSize:14}).width` measurement call must become `new Text({ text: '188:88', style: { fontSize: 14 } }).width`. Since this component doesn't actually need two separate Pixi objects (the `pixiApp` field is constructed but never used elsewhere in the file), replace the unused `Application` field with `stage`/renderer state driven entirely by the async-initialized `Application`, keeping the exact same manual `requestAnimationFrame` render loop pattern (do not switch to `Application`'s own built-in ticker — that would be a behavior change beyond version compatibility, deferred out of scope per the Global Constraints). `BoxedText`'s own `textStyle` option (e.g. `{ fill: '#ffffff', fontSize: 14 }`) is unaffected — `fill` remains a valid `TextStyleOptions` property in v8 for text color, distinct from `Graphics`'s new `.fill()` method fixed in Task 10 Step 4:
```typescript
import { Application, Container, Text } from 'pixi.js';
...
  @ViewChild('container') container!: ElementRef;
  private pixiApp!: Application;
  private stage!: Container;
  ...
  async ngAfterViewInit() {
    this.pixiApp = new Application();
    await this.pixiApp.init({
      width: 640,
      height: 480,
      backgroundColor: 0xffffff,
      antialias: true,
    });
    this.stage = new Container();
    this.container.nativeElement.appendChild(this.pixiApp.canvas);

    const timeBox = new BoxedText({
      text: this.timer$,
      minWidth: new Text({ text: '188:88', style: { fontSize: 14 } }).width,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize: 14 },
    });
    const testName = new BoxedText({
      // @ts-ignore
      text: this.textContent.valueChanges.pipe(startWith(this.textContent.value!)) as Observable<string>,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize: 14 },
    });

    const testName2 = new BoxedText({
      text: 'Test',
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize: 14 },
    });

    const block = createGridLayout([[timeBox, testName, testName2]]);
    this.stage.addChild(block);

    this.ngZone.runOutsideAngular(() => this.animate());
  }
  ...
  private animate() {
    this.pixiApp.renderer.render(this.stage);
    requestAnimationFrame(() => this.animate());
  }
```
(`Application`'s `.canvas` property replaces the old `Renderer.view`; `.renderer.render(stage)` replaces the standalone `Renderer` instance's `.render(stage)` — the manual `requestAnimationFrame` loop calling it explicitly is unchanged, matching the Global Constraints note not to restructure this component's Pixi setup beyond what compiling under v8 requires.) The `TextStyle` import is no longer needed directly in this file — remove it from the `pixi.js` import line as shown above (it's still used inside `boxed-text.ts`, which keeps its own import).

- [ ] **Step 7: Update the pixi.js mock in `src/app/app.component.spec.ts`**

Task 0 added a `jest.mock('pixi.js', ...)` to this spec file shaped for the pre-v8 API (`Application` mocked as a bare `{}`, `Renderer` mocked with `.view`/`.render`). Step 6 above changed `app.component.ts` to construct `Application` with no constructor args and then `await`-call `.init(...)`, and to read `.canvas` instead of using a separate `Renderer`. The existing mock does not support this — `this.pixiApp.init(...)` would throw `TypeError: this.pixiApp.init is not a function`. Update the mock:
```typescript
jest.mock('pixi.js', () => {
  const actual = jest.requireActual('pixi.js');
  return {
    ...actual,
    Application: jest.fn().mockImplementation(() => ({
      init: jest.fn().mockResolvedValue(undefined),
      canvas: document.createElement('canvas'),
      renderer: { render: jest.fn() },
    })),
  };
});
```
The `Renderer` mock entry is no longer needed (production code no longer imports `Renderer` after Step 6) — remove it from the returned object. Leave the rest of `app.component.spec.ts` (both `it(...)` blocks) unchanged.

- [ ] **Step 8: Build, and check whether `skipLibCheck` is still needed**

```
npm run build
```
Expected: succeeds with no TypeScript errors referencing removed/renamed pixi.js types.

Task 1 added `"skipLibCheck": true` to `tsconfig.json` specifically to resolve `.d.ts`-vs-`.d.ts` conflicts between pixi.js v7's type declarations and TypeScript's DOM lib types. Now that pixi.js is v8, check whether it's still needed: temporarily remove `"skipLibCheck": true` from `tsconfig.json` and re-run `npm run build`. If it still succeeds, leave `skipLibCheck` removed (this restores full type-checking of third-party `.d.ts` files for the rest of the codebase going forward) and note this in the task report. If removing it reintroduces compile errors, restore `"skipLibCheck": true` and note in the report exactly which errors reappeared (so it's clear this is still load-bearing, not just inertia).

- [ ] **Step 9: Test**

```
npm test
```
Expected: same pass count as baseline (none of the existing spec files test the Pixi entities directly, per the file listing in `src/app/entities/` having no `.spec.ts` files — if `npm test` still passes trivially, that's expected, not a sign the migration wasn't exercised; the real verification is the visual smoke test in Step 10). If `app.component.spec.ts`'s "should create the app" test fails, confirm the Step 7 mock update was applied correctly.

- [ ] **Step 10: Launch and visually confirm the overlay renders correctly**

```
npm run electron:local
```
Confirm:
- a black box with white "Example" text renders (the `testName` `BoxedText` bound to the text input's initial value),
- a black box with a countdown timer text (`188:88`-width box, initially showing time counting down from 1:05) renders next to it,
- a third black box with static "Test" text renders,
- all three boxes are laid out in a single horizontal row (the `createGridLayout` grid), matching the pre-upgrade layout.

Type into the text input and confirm the middle box's text updates live. Click "Start"/"Stop" and confirm the timer box's text starts/stops counting down.

If running in an environment with an accessible Windows desktop session, capture a screenshot for visual confirmation instead of relying on manual observation:
```powershell
Start-Process -FilePath "npm" -ArgumentList "run","electron:local" -PassThru | Out-Null
Start-Sleep -Seconds 8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save("$env:TEMP\task10-pixi-smoke.png")
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
```
Read the saved PNG and check it against the three bullets above. If no display session is available, note this in the task report as `DONE_WITH_CONCERNS` and flag that a human should confirm visually before this task is considered fully verified — unlike the earlier tasks, this one has no automated test coverage for the thing that actually changed (see Step 9), so the visual check is the only regression test that exists for this task. If any box fails to render, white text disappears into no box background (a sign the `Graphics` `.rect().fill()` conversion in Step 4 is wrong), or text isn't centered, fix `boxed-text.ts` before proceeding.

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "chore: upgrade pixi.js to v8, migrate entities and app.component to v8 API"
```

---

### Task 11: Final validation and documentation update

**Files:**
- Modify: `sports-livestream/CLAUDE.md`

**Interfaces:**
- Consumes: repo with all of Tasks 1-10 complete — build/test green, app launches and renders correctly.
- Produces: one final end-to-end validation pass, and `CLAUDE.md`'s version references updated to match reality — committed.

- [ ] **Step 1: Full clean install and build**

```
rm -rf node_modules dist
npm install
npm run build
```
Expected: succeeds from a completely clean `node_modules`/`dist` — this catches any dependency that was only working by accident because of a stale `node_modules` state left over from the incremental upgrade tasks.

- [ ] **Step 2: Full test run**

```
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Full packaged-app smoke test**

```
npm run dist
```
Expected: `electron-builder --dir` succeeds and produces an unpacked app under `build/`. Launch the unpacked executable directly (not via `npm start`/`electron:local`) to confirm the packaged app — with its generated `package.json`/`asar` layout — still resolves `main` (`electron/main.mjs`) and `preload` correctly.

If running in an environment with an accessible Windows desktop session, capture a screenshot for visual confirmation (adjust the executable path/name to whatever `electron-builder` produced under `build/`, found via `Get-ChildItem build/win-unpacked/*.exe`):
```powershell
$exe = (Get-ChildItem "build/win-unpacked/*.exe")[0].FullName
Start-Process -FilePath $exe -PassThru | Out-Null
Start-Sleep -Seconds 8
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save("$env:TEMP\task11-packaged-smoke.png")
Get-Process -Name (Split-Path $exe -LeafBase) -ErrorAction SilentlyContinue | Stop-Process -Force
```
Read the saved PNG and confirm the same overlay/UI as Task 10 Step 9. If no display session is available, note this in the task report as `DONE_WITH_CONCERNS` and flag that a human should do a final packaged-app confirmation before this upgrade is considered fully done.

- [ ] **Step 4: Update CLAUDE.md**

Read `sports-livestream/CLAUDE.md`. Update the version references and any command names that changed across this plan:
- "An Electron + Angular 15 desktop app" → "An Electron + Angular 22 desktop app"
- Any mention of the `esbuild-electron` script's output being `.js` → `.mjs`
- Note that `electron/app-store.ts` now uses a native ESM `import` for `electron-store` (no more CommonJS `require` workaround)
- Note the pixi.js version is now v8

Do not add new sections describing the signals/zoneless refactor — that hasn't happened yet (it's the next, separate spec).

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "chore: final validation pass, update CLAUDE.md for version upgrade"
```

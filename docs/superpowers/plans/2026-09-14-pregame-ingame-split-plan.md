# Pre-Game / In-Game Split View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single unrouted demo screen with a persistent canvas plus a routed side panel, split into a pre-game view (real device settings, placeholder rosters/information) and an in-game view (placeholder scenes/messages).

**Architecture:** The Pixi canvas and the camera/mic streams stay mounted in `AppComponent` and are never routed, so navigating does not tear down the renderer or re-acquire devices. Only a side panel is routed, via Angular Router with two eager component routes and a redirect from `''`. Device selections and mic gains persist through `AppStoreService`.

**Tech Stack:** Angular 22 (standalone components, signals, zoneless change detection), Angular Router, Web Audio API, MediaDevices API, Jest 30 + jest-preset-angular 17.

**Spec:** `docs/superpowers/specs/2026-09-13-pregame-ingame-split-design.md`

## Global Constraints

- **Angular 22, zoneless.** `provideZonelessChangeDetection()` is already in `src/main.ts`. Do not add `zone.js`, and do not call `detectChanges()` from application code.
- **`OnPush` is the Angular 22 default** (`ChangeDetectionStrategy.OnPush = 0`; `Eager = 1` is the renamed legacy `Default`). **Omit the `changeDetection` property entirely on every new component.** `AppComponent` explicitly sets `Eager` as a leftover of the version upgrade — do not copy that.
- **Standalone components only.** No `NgModule`. Declare dependencies in the component's `imports` array.
- **Use signals for component state** (`signal`, `computed`, `viewChild`), matching the post-migration `AppComponent`.
- **Use `inject()` for all DI**, as declared fields — not constructor parameters. Declare an injected field *before* any field whose initializer reads it; field initializers run in declaration order, so `private a = inject(A); b = f(this.a);` is safe while the reverse order is not. Task 7 converts the one pre-existing constructor-injected service.
- **Test selectors:** use `fixture.nativeElement.querySelector('[data-test="..."]')`. Do **not** import `src/test/utils/test-utils.ts` — `createServiceStub` at line 37 does not compile under `strict` (`TS7053`), which makes the whole module unimportable. Fixing it is out of scope for this plan.
- **New view components live in `src/app/views/<view-name>/`.** Services keep their existing `src/app/services/<name>/` layout.
- Run the full suite with `npm test`; a single file with `npx jest <path>`.

## Spec Deviations

Three claims in the spec do not match the code as it stands today. Each is handled as noted; do not "restore" the spec's version.

1. **Spec §"Scope decisions" says `RouterModule` is already imported in `app.component.ts` but unused.** It is not — after the signals migration `AppComponent` imports only `ReactiveFormsModule`. Task 4 adds `RouterOutlet`, `RouterLink` and `RouterLinkActive` directly (not `RouterModule`).
2. **Spec §2 says `AudioService.audioInputs` is "already populated by the service's constructor".** It is populated *asynchronously* inside a `subscribe` with no completion signal, so a component reading it on init races the constructor and usually sees `{}`. Task 6 adds an `audioInputs$` observable. This is a new `AudioService` member, which spec §5 says will not be needed — the spec is wrong on this point.
3. **Spec §2 has the camera list call `groupCamerasByResolution()`.** That method opens a `getUserMedia` stream per camera and never stops any of them, so listing cameras leaves every camera held open (recording light on, device locked against other apps). Task 5 stops the tracks. Without this the camera picker is unusable.

Also note: `AudioService` initialises every mic's gain to `0`, so **all mics are muted until a slider moves them**. That is existing behaviour, not a bug introduced here; Task 6's sliders are what make audio audible.

---

### Task 1: Make `AppStoreService` return stored values

`get()` calls through to the bridge but never returns the result, so every read is `undefined`. Every persistence step in this plan depends on this. The existing spec only asserts that the bridge was *called*, which is why the missing `return` survived.

**Files:**
- Modify: `src/app/services/app-store/app-store.service.ts:8-10`
- Test: `src/app/services/app-store/app-store.service.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppStoreService.get<T = unknown>(prop: string): T` — used by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test**

Add to `src/app/services/app-store/app-store.service.spec.ts`, inside the top-level `describe`:

```typescript
  it('returns the value held in the store', () => {
    (window.appStore.get as jest.Mock).mockReturnValue('camera-abc');

    expect(service.get('selectedCameraDeviceId')).toBe('camera-abc');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/services/app-store/app-store.service.spec.ts -t "returns the value held in the store"`
Expected: FAIL — `Expected: "camera-abc"`, `Received: undefined`.

- [ ] **Step 3: Write minimal implementation**

Replace `get` in `src/app/services/app-store/app-store.service.ts`:

```typescript
  get<T = unknown>(prop: string): T {
    return window.appStore.get(prop);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/app/services/app-store/app-store.service.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/services/app-store/app-store.service.ts src/app/services/app-store/app-store.service.spec.ts
git commit -m "fix: return the value read from the app store"
```

---

### Task 2: `InGamePanelComponent`

The routed in-game side panel. Scenes and messages do not exist yet, so both are marked stubs — this task establishes the routed-view pattern the rest follow.

**Files:**
- Create: `src/app/views/in-game/in-game-panel.component.ts`
- Create: `src/app/views/in-game/in-game-panel.component.html`
- Create: `src/app/views/in-game/in-game-panel.component.scss`
- Test: `src/app/views/in-game/in-game-panel.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `InGamePanelComponent` (standalone, selector `app-in-game-panel`) — routed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/app/views/in-game/in-game-panel.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { InGamePanelComponent } from './in-game-panel.component';

describe('InGamePanelComponent', () => {
  const render = async () => {
    await TestBed.configureTestingModule({
      imports: [InGamePanelComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(InGamePanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('marks where the scene picker will mount', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="scenes-section"]')?.textContent).toContain(
      'Scenes'
    );
  });

  it('marks where the message triggers will mount', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="messages-section"]')?.textContent).toContain(
      'Messages'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/views/in-game/in-game-panel.component.spec.ts`
Expected: FAIL — `Cannot find module './in-game-panel.component'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/views/in-game/in-game-panel.component.ts`:

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-in-game-panel',
  templateUrl: './in-game-panel.component.html',
  styleUrls: ['./in-game-panel.component.scss'],
})
export class InGamePanelComponent {}
```

Create `src/app/views/in-game/in-game-panel.component.html`:

```html
<section class="panel-section" data-test="scenes-section">
  <h2>Scenes</h2>
  <p class="stub">Scene selection is not built yet.</p>
</section>

<section class="panel-section" data-test="messages-section">
  <h2>Messages</h2>
  <p class="stub">Message triggers are not built yet.</p>
</section>
```

Create `src/app/views/in-game/in-game-panel.component.scss`:

```scss
.panel-section {
  padding: 0.75rem 0;

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

.stub {
  margin: 0;
  opacity: 0.6;
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/views/in-game/in-game-panel.component.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/views/in-game
git commit -m "feat: add in-game side panel view"
```

---

### Task 3: `PreGameComponent` shell

The pre-game view's three sections. Settings is left empty here and filled by Tasks 5 and 6; Rosters and Information stay stubs by spec §2.

**Files:**
- Create: `src/app/views/pre-game/pre-game.component.ts`
- Create: `src/app/views/pre-game/pre-game.component.html`
- Create: `src/app/views/pre-game/pre-game.component.scss`
- Test: `src/app/views/pre-game/pre-game.component.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PreGameComponent` (standalone, selector `app-pre-game`) — routed by Task 4, extended by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test**

Create `src/app/views/pre-game/pre-game.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { PreGameComponent } from './pre-game.component';

describe('PreGameComponent', () => {
  const render = async () => {
    await TestBed.configureTestingModule({
      imports: [PreGameComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PreGameComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows a settings section', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="settings-section"]')).toBeTruthy();
  });

  it('shows rosters and information as not-yet-built', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="rosters-section"]')?.textContent).toContain(
      'not built yet'
    );
    expect(
      panel.querySelector('[data-test="information-section"]')?.textContent
    ).toContain('not built yet');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: FAIL — `Cannot find module './pre-game.component'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/views/pre-game/pre-game.component.ts`:

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-pre-game',
  templateUrl: './pre-game.component.html',
  styleUrls: ['./pre-game.component.scss'],
})
export class PreGameComponent {}
```

Create `src/app/views/pre-game/pre-game.component.html`:

```html
<section class="panel-section" data-test="settings-section">
  <h2>Settings</h2>
</section>

<section class="panel-section" data-test="rosters-section">
  <h2>Rosters</h2>
  <p class="stub">Rosters are not built yet.</p>
</section>

<section class="panel-section" data-test="information-section">
  <h2>Information</h2>
  <p class="stub">Game information is not built yet.</p>
</section>
```

Create `src/app/views/pre-game/pre-game.component.scss`:

```scss
.panel-section {
  padding: 0.75rem 0;

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}

.stub {
  margin: 0;
  opacity: 0.6;
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/views/pre-game
git commit -m "feat: add pre-game view shell"
```

---

### Task 4: Routing shell and persistent canvas layout

Populates the empty `routes` array, and restructures `AppComponent` so the Pixi canvas sits beside a routed side panel. The renderer, stage, timer and `animate()` loop are **not** moved or changed — only the surrounding markup.

**Files:**
- Create: `src/app/app.routes.ts`
- Create: `src/app/app.routes.spec.ts`
- Modify: `src/main.ts:5-6` (replace the empty inline `routes` array with the imported one)
- Modify: `src/app/app.component.ts` (add router directives to `imports`)
- Modify: `src/app/app.component.html` (whole file)
- Modify: `src/app/app.component.scss` (currently empty)

**Interfaces:**
- Consumes: `PreGameComponent` (Task 3), `InGamePanelComponent` (Task 2).
- Produces: `routes: Routes` exported from `src/app/app.routes.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/app/app.routes.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { PreGameComponent } from './views/pre-game/pre-game.component';
import { InGamePanelComponent } from './views/in-game/in-game-panel.component';

describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideLocationMocks()],
    });
  });

  it('opens the pre-game view for the empty path', async () => {
    const harness = await RouterTestingHarness.create();

    const view = await harness.navigateByUrl('/', PreGameComponent);

    expect(view).toBeInstanceOf(PreGameComponent);
    expect(TestBed.inject(Router).url).toBe('/pre-game');
  });

  it('opens the in-game panel for /in-game', async () => {
    const harness = await RouterTestingHarness.create();

    const view = await harness.navigateByUrl('/in-game', InGamePanelComponent);

    expect(view).toBeInstanceOf(InGamePanelComponent);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/app.routes.spec.ts`
Expected: FAIL — `Cannot find module './app.routes'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';
import { InGamePanelComponent } from './views/in-game/in-game-panel.component';
import { PreGameComponent } from './views/pre-game/pre-game.component';

export const routes: Routes = [
  { path: 'pre-game', component: PreGameComponent },
  { path: 'in-game', component: InGamePanelComponent },
  { path: '', redirectTo: 'pre-game', pathMatch: 'full' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/app.routes.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point `main.ts` at the real routes**

Replace the whole of `src/main.ts`:

```typescript
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideRouter(routes)],
});
```

- [ ] **Step 6: Write the failing test for the shell**

Add to `src/app/app.component.spec.ts`, inside the existing top-level `describe` (keep everything already there — the canvas stubs are required):

```typescript
  it('renders navigation to both views alongside the canvas', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-test="nav-pre-game"]')).toBeTruthy();
    expect(compiled.querySelector('[data-test="nav-in-game"]')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx jest src/app/app.component.spec.ts -t "renders navigation"`
Expected: FAIL — `expect(received).toBeTruthy()`, received `null`.

- [ ] **Step 8: Add the router directives to `AppComponent`**

In `src/app/app.component.ts`, add the import:

```typescript
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
```

and change the component's `imports` array to:

```typescript
    imports: [ReactiveFormsModule, RouterOutlet, RouterLink, RouterLinkActive]
```

Leave `changeDetection: ChangeDetectionStrategy.Eager` on `AppComponent` as it is — changing it is not part of this plan.

- [ ] **Step 9: Restructure the template**

Replace the whole of `src/app/app.component.html`:

```html
<div class="workspace">
  <main class="stage">
    <div #container></div>

    <div class="stage-controls">
      <input type="text" [formControl]="textContent">
      @if (status() === 'running') {
        <button (click)="stopTimer()">Stop</button>
      } @else if (status() === 'stopped') {
        <button (click)="startTimer()">Start</button>
      }
    </div>
  </main>

  <aside class="panel">
    <nav class="view-tabs">
      <a routerLink="/pre-game" routerLinkActive="active" data-test="nav-pre-game">Pre-Game</a>
      <a routerLink="/in-game" routerLinkActive="active" data-test="nav-in-game">In-Game</a>
    </nav>

    <router-outlet />
  </aside>
</div>
```

- [ ] **Step 10: Add the layout styles**

Replace the whole of `src/app/app.component.scss` (it is currently empty):

```scss
.workspace {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
}

.stage-controls {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.panel {
  flex: 1;
  min-width: 16rem;
  max-width: 24rem;
}

.view-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);

  a {
    padding: 0.5rem 0.75rem;
    text-decoration: none;
    color: inherit;
    cursor: pointer;

    &.active {
      font-weight: 600;
      border-bottom: 2px solid currentColor;
    }
  }
}
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: PASS — all suites green, including the pre-existing `should render the container and controls` test (the text input is still in the template).

- [ ] **Step 12: Verify the app builds**

Run: `npm run build`
Expected: both concurrent steps exit 0.

- [ ] **Step 13: Commit**

```bash
git add src/app/app.routes.ts src/app/app.routes.spec.ts src/main.ts src/app/app.component.ts src/app/app.component.html src/app/app.component.scss src/app/app.component.spec.ts
git commit -m "feat: route a side panel beside the persistent canvas"
```

---

### Task 5: Camera selection in pre-game settings

Adds the camera picker to the Settings section, and stops the enumeration streams that `groupCamerasByResolution()` currently leaks.

**Files:**
- Modify: `src/app/services/video/video.service.ts:12-38`
- Test: `src/app/services/video/video.service.spec.ts`
- Modify: `src/app/views/pre-game/pre-game.component.ts`
- Modify: `src/app/views/pre-game/pre-game.component.html` (settings section only)
- Test: `src/app/views/pre-game/pre-game.component.spec.ts`

**Interfaces:**
- Consumes: `AppStoreService.get`/`set` (Task 1), `PreGameComponent` (Task 3).
- Produces: `VideoService.groupCamerasByResolution(): Promise<{ [resolution: string]: MediaDeviceInfo[] }>` (unchanged signature, now releases devices); persisted key `selectedCameraDeviceId`.

- [ ] **Step 1: Write the failing test for the leak**

Replace the contents of `src/app/services/video/video.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';

import { VideoService } from './video.service';

describe('VideoService', () => {
  let service: VideoService;
  let stoppedTracks: number;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoService);
    stoppedTracks = 0;

    const track = {
      getSettings: () => ({ width: 1920, height: 1080 }),
      stop: () => {
        stoppedTracks += 1;
      },
    };

    (navigator as any).mediaDevices = {
      enumerateDevices: jest.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Front' },
        { kind: 'videoinput', deviceId: 'cam-2', label: 'Side' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
      ]),
      getUserMedia: jest.fn().mockResolvedValue({
        getVideoTracks: () => [track],
        getTracks: () => [track],
      }),
    };
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('groups cameras by the resolution they report', async () => {
    const cameras = await service.groupCamerasByResolution();

    expect(Object.keys(cameras)).toEqual(['1920x1080']);
    expect(cameras['1920x1080'].map((d) => d.deviceId)).toEqual(['cam-1', 'cam-2']);
  });

  it('releases every camera it opened while probing resolutions', async () => {
    await service.groupCamerasByResolution();

    expect(stoppedTracks).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/services/video/video.service.spec.ts`
Expected: FAIL on `releases every camera it opened` — `Expected: 2, Received: 0`. The grouping test passes.

- [ ] **Step 3: Stop the probe streams**

Replace `groupCamerasByResolution` in `src/app/services/video/video.service.ts`:

```typescript
  async groupCamerasByResolution() {
    const cameras: { [resolution: string]: MediaDeviceInfo[] } = {};
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === 'videoinput');

    for (const device of videoDevices) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: device.deviceId },
      });

      try {
        const settings = stream.getVideoTracks()[0].getSettings();
        const key = `${settings.width}x${settings.height}`;
        (cameras[key] ??= []).push(device);
      } finally {
        // Probing holds the camera open otherwise: recording light on, and the
        // device locked against the app's own later getUserMedia call.
        stream.getTracks().forEach((track) => track.stop());
      }
    }

    return cameras;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/services/video/video.service.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for the picker**

Add to `src/app/views/pre-game/pre-game.component.spec.ts`. Replace the existing `render` helper and imports with this, keeping the two tests already in the file:

```typescript
import { TestBed } from '@angular/core/testing';
import { PreGameComponent } from './pre-game.component';
import { VideoService } from '../../services/video/video.service';
import { AudioService } from '../../services/audio/audio.service';
import { AppStoreService } from '../../services/app-store/app-store.service';

const cameras = {
  '1920x1080': [{ deviceId: 'cam-1', label: 'Front' } as MediaDeviceInfo],
  '1280x720': [{ deviceId: 'cam-2', label: 'Side' } as MediaDeviceInfo],
};

describe('PreGameComponent', () => {
  let stored: { [key: string]: unknown };

  const render = async () => {
    stored = {};
    (navigator as any).mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [] }),
    };

    await TestBed.configureTestingModule({
      imports: [PreGameComponent],
      providers: [
        {
          provide: VideoService,
          useValue: { groupCamerasByResolution: jest.fn().mockResolvedValue(cameras) },
        },
        { provide: AudioService, useValue: { audioInputs$: { subscribe: jest.fn() } } },
        {
          provide: AppStoreService,
          useValue: {
            get: (key: string) => stored[key],
            set: (key: string, value: unknown) => {
              stored[key] = value;
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PreGameComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };
```

Then add these two tests inside the same `describe`:

```typescript
  it('lists every camera found, grouped by resolution', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    const options = panel.querySelectorAll('[data-test="camera-option"]');
    expect(Array.from(options).map((o) => o.textContent?.trim())).toEqual([
      'Front',
      'Side',
    ]);
  });

  it('persists the camera the operator picks', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    panel.querySelectorAll<HTMLButtonElement>('[data-test="camera-option"]')[1].click();
    await fixture.whenStable();

    expect(stored['selectedCameraDeviceId']).toBe('cam-2');
  });

  it('shows a self-preview of the chosen camera', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('[data-test="camera-preview"]')).toBeFalsy();

    panel.querySelectorAll<HTMLButtonElement>('[data-test="camera-option"]')[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(panel.querySelector('[data-test="camera-preview"]')).toBeTruthy();
  });
```

Update the two existing tests in this file to use the new helper — they currently do `const panel = await render();` and must become:

```typescript
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: FAIL — the three new tests fail because no `[data-test="camera-option"]` elements exist.

- [ ] **Step 7: Implement the picker**

Replace `src/app/views/pre-game/pre-game.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { AppStoreService } from '../../services/app-store/app-store.service';
import { VideoService } from '../../services/video/video.service';

const SELECTED_CAMERA = 'selectedCameraDeviceId';

@Component({
  selector: 'app-pre-game',
  templateUrl: './pre-game.component.html',
  styleUrls: ['./pre-game.component.scss'],
})
export class PreGameComponent implements OnInit {
  private videoService = inject(VideoService);
  private appStore = inject(AppStoreService);

  /** Camera devices keyed by the resolution they reported while probing. */
  cameraGroups = signal<{ [resolution: string]: MediaDeviceInfo[] }>({});
  selectedCameraId = signal<string | undefined>(undefined);
  preview = signal<MediaStream | undefined>(undefined);

  async ngOnInit() {
    this.selectedCameraId.set(this.appStore.get<string | undefined>(SELECTED_CAMERA));
    this.cameraGroups.set(await this.videoService.groupCamerasByResolution());
  }

  get resolutions(): string[] {
    return Object.keys(this.cameraGroups());
  }

  async selectCamera(deviceId: string) {
    this.selectedCameraId.set(deviceId);
    this.appStore.set(SELECTED_CAMERA, deviceId);

    // Release the previous preview before opening the next camera.
    this.preview()?.getTracks().forEach((track) => track.stop());
    this.preview.set(
      await navigator.mediaDevices.getUserMedia({ video: { deviceId } })
    );
  }
}
```

Replace the settings `<section>` in `src/app/views/pre-game/pre-game.component.html` (leave the rosters and information sections untouched):

```html
<section class="panel-section" data-test="settings-section">
  <h2>Settings</h2>

  <h3>Camera</h3>
  @for (resolution of resolutions; track resolution) {
    <div class="resolution-group">
      <span class="resolution">{{ resolution }}</span>
      @for (camera of cameraGroups()[resolution]; track camera.deviceId) {
        <button
          type="button"
          class="device"
          data-test="camera-option"
          [class.selected]="camera.deviceId === selectedCameraId()"
          (click)="selectCamera(camera.deviceId)"
        >{{ camera.label }}</button>
      }
    </div>
  }

  @if (preview(); as stream) {
    <video
      class="preview"
      data-test="camera-preview"
      autoplay
      muted
      playsinline
      [srcObject]="stream"
    ></video>
  }
</section>
```

The preview is a plain `<video>`, deliberately not routed through Pixi — spec §2 notes there is no Pixi consumer for camera video until the scenes system exists, so this is only "see what you picked".

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add src/app/services/video src/app/views/pre-game
git commit -m "feat: pick and persist a camera in pre-game settings"
```

---

### Task 6: Microphone gain sliders

Adds a gain slider per mic. Requires a readiness signal on `AudioService`, because `audioInputs` is filled asynchronously and a component reading it on init sees `{}`.

**Files:**
- Modify: `src/app/services/audio/audio.service.ts:8-67`
- Test: `src/app/services/audio/audio.service.spec.ts`
- Modify: `src/app/views/pre-game/pre-game.component.ts`
- Modify: `src/app/views/pre-game/pre-game.component.html` (settings section only)
- Test: `src/app/views/pre-game/pre-game.component.spec.ts`

**Interfaces:**
- Consumes: `AppStoreService` (Task 1), `PreGameComponent` (Tasks 3 and 5).
- Produces: `AudioService.audioInputs$: Observable<{ [deviceId: string]: { gainNode: GainNode; label: string } }>`; persisted key `micGains` holding `{ [deviceId: string]: number }`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/services/audio/audio.service.spec.ts`, inside the top-level `describe`:

```typescript
  it('publishes its mixed inputs once the devices have been wired up', async () => {
    const inputs = await new Promise<Record<string, { label: string }>>((resolve) => {
      service.audioInputs$.subscribe((value) => {
        if (Object.keys(value).length) resolve(value as any);
      });
    });

    expect(Object.values(inputs).map((i) => i.label).sort()).toEqual(
      Object.values(service.audioInputs).map((i) => i.label).sort()
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/services/audio/audio.service.spec.ts -t "publishes its mixed inputs"`
Expected: FAIL — `service.audioInputs$ is undefined`.

- [ ] **Step 3: Publish the inputs**

In `src/app/services/audio/audio.service.ts`, add `BehaviorSubject` to the rxjs import:

```typescript
import { BehaviorSubject, forkJoin, from, map, of, switchMap, tap, zip } from 'rxjs';
```

Add these members next to the existing `gains` field:

```typescript
  private inputs = new BehaviorSubject<{
    [deviceId: string]: { gainNode: GainNode; label: string };
  }>({});

  /** Emits once each device's stream has been connected to the mixer. */
  readonly audioInputs$ = this.inputs.asObservable();
```

and at the end of the constructor's `subscribe` callback, after the existing `forEach`, add:

```typescript
        this.inputs.next({ ...this.gains });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/services/audio/audio.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the sliders**

Add to `src/app/views/pre-game/pre-game.component.spec.ts`. First replace the `AudioService` provider in the `render` helper with one that emits a real gain-bearing map:

```typescript
        {
          provide: AudioService,
          useValue: {
            audioInputs$: of({
              'mic-1': { label: 'Headset', gainNode: { gain: { value: 0 } } },
              'mic-2': { label: 'Ambient', gainNode: { gain: { value: 0 } } },
            }),
          },
        },
```

and add `import { of } from 'rxjs';` to the file's imports. Then add:

```typescript
  it('shows a gain slider for every microphone', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelectorAll('[data-test="mic-gain"]').length).toBe(2);
  });

  it('applies and persists a gain change', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    const slider = panel.querySelectorAll<HTMLInputElement>('[data-test="mic-gain"]')[0];
    slider.value = '0.75';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.componentInstance.micInputs()['mic-1'].gainNode.gain.value).toBe(0.75);
    expect(stored['micGains']).toEqual({ 'mic-1': 0.75 });
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: FAIL — no `[data-test="mic-gain"]` elements exist.

- [ ] **Step 7: Implement the sliders**

In `src/app/views/pre-game/pre-game.component.ts`, add to the imports:

```typescript
import { AudioService } from '../../services/audio/audio.service';
import { toSignal } from '@angular/core/rxjs-interop';
```

Add the constant next to `SELECTED_CAMERA`:

```typescript
const MIC_GAINS = 'micGains';
```

`videoService` and `appStore` are already declared from Task 5 — **do not re-declare them.** Add only `audioService` (above the existing two) and `micInputs` after them. Declaration order matters: `micInputs`'s initializer reads `this.audioService`, so the field must come first. The top of the class body should end up exactly:

```typescript
export class PreGameComponent implements OnInit {
  private audioService = inject(AudioService);
  private videoService = inject(VideoService);
  private appStore = inject(AppStoreService);

  micInputs = toSignal(this.audioService.audioInputs$, { initialValue: {} });
```

Then add these members:

```typescript
  setGain(deviceId: string, value: string) {
    const gain = Number(value);
    const input = this.micInputs()[deviceId];
    if (!input) return;

    input.gainNode.gain.value = gain;
    const gains = this.appStore.get<{ [id: string]: number }>(MIC_GAINS) ?? {};
    this.appStore.set(MIC_GAINS, { ...gains, [deviceId]: gain });
  }

  gainOf(deviceId: string): number {
    return this.micInputs()[deviceId]?.gainNode.gain.value ?? 0;
  }
```

Append to the settings `<section>` in `src/app/views/pre-game/pre-game.component.html`, after the camera block and still inside the section:

```html
  <h3>Microphones</h3>
  @for (entry of micInputs() | keyvalue; track entry.key) {
    <label class="device">
      <span>{{ entry.value.label }}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        data-test="mic-gain"
        [value]="gainOf(entry.key)"
        (input)="setGain(entry.key, $any($event.target).value)"
      >
    </label>
  }
```

Add `KeyValuePipe` to the component's `imports`:

```typescript
import { KeyValuePipe } from '@angular/common';
```

and on the `@Component` decorator:

```typescript
  imports: [KeyValuePipe],
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest src/app/views/pre-game/pre-game.component.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Run the full suite and build**

Run: `npm test`
Expected: all suites green.

Run: `npm run build`
Expected: both concurrent steps exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/app/services/audio src/app/views/pre-game
git commit -m "feat: adjust and persist microphone gains in pre-game settings"
```

---

### Task 7: Convert `RecordService` to `inject()`

The only pre-existing service using constructor injection. Converting it leaves the codebase uniformly on `inject()`. This is a pure mechanism swap with no behaviour change, so it adds no new test — the existing `record.service.spec.ts` is the safety net, and it must stay green without being edited.

**Files:**
- Modify: `src/app/services/record/record.service.ts:1-9`
- Test: `src/app/services/record/record.service.spec.ts` (must pass **unmodified**)

**Interfaces:**
- Consumes: nothing.
- Produces: no public API change — `RecordService`'s methods and fields are untouched.

- [ ] **Step 1: Confirm the safety net is green before touching anything**

Run: `npx jest src/app/services/record/record.service.spec.ts`
Expected: PASS, 10 tests. If this is not green, stop — something earlier in the plan broke it.

- [ ] **Step 2: Swap constructor injection for a field**

In `src/app/services/record/record.service.ts`, change the `@angular/core` import to:

```typescript
import { Injectable, inject } from '@angular/core';
```

and replace the constructor with an injected field, declared first in the class body:

```typescript
export class RecordService {
  private audioService = inject(AudioService);

  recording$: BehaviorSubject<boolean> = new BehaviorSubject(false);
```

Delete the `constructor(private audioService: AudioService) {}` line entirely. Change nothing else — `this.audioService.audioTrack` in `setVideoStream` keeps working as-is.

- [ ] **Step 3: Run the spec to verify it still passes**

Run: `npx jest src/app/services/record/record.service.spec.ts`
Expected: PASS, 10 tests — the same 10, with the spec file unedited.

- [ ] **Step 4: Run the full suite and build**

Run: `npm test`
Expected: all suites green.

Run: `npm run build`
Expected: both concurrent steps exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/services/record/record.service.ts
git commit -m "refactor: inject AudioService with inject() in RecordService"
```

---

## Done when

- Launching the app opens the pre-game view with the canvas still rendering beside it.
- Switching to In-Game and back does not recreate the Pixi application (the `animate()` loop is never re-entered) and does not re-acquire camera/mic streams.
- A camera picked in pre-game is still selected after restarting the app.
- Mic gain positions survive a restart.
- `npm test` and `npm run build` both pass.

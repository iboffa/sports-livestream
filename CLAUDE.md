# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron + Angular 22 desktop app for producing a sports livestream: it mixes local camera/microphone inputs, renders a Pixi.js (v8) graphics overlay (scoreboard/timer/name plates) on top, and pipes the composited video into `ffmpeg` for local recording and/or streaming.

## Commands

- `npm start` — dev mode: runs `ng serve` and the Electron shell concurrently with hot reload (`electron:dev-start` builds `electron/*.ts` with esbuild, waits for `http://localhost:4200`, then launches Electron with `NODE_ENV=dev`).
- `npm run build` — builds the Angular renderer (`ng build --base-href=./` → `dist/app`) and the Electron main/preload scripts (`esbuild-electron` → `dist/electron/main.mjs` + `dist/electron/preload.js`) in parallel. Both outputs are required before Electron can run a non-dev build.
- `npm run electron` — full build, then launches Electron against the built output.
- `npm test` — runs the Jest unit suite (`jest --no-cache`, `jest-preset-angular`, setup in `setup-jest.ts`).
  - Single file: `npx jest src/app/services/record/record.service.spec.ts`
  - Single test: `npx jest -t "should add audioTrack to the stream"`
- `npm run dist` / `npm run pack` — build + `electron-builder --dir` (unpacked app; `pack` targets `--win --x64`).
- `npm run release` — build + full `electron-builder` packaging/publish.

There is no lint script and no e2e suite in this project (contrast with the `matchvisio` sibling repo, which has both).

## Architecture

This follows Electron's two-process model with a locked-down renderer (`app.enableSandbox()` in `electron/main.ts`); the two sides only talk through the `contextBridge` API in `electron/preload.ts`.

**Electron main process (`electron/`)**
- `main.ts` creates the sandboxed `BrowserWindow` and boots two static singletons before it: `AppStore` and `FFmpegRunner`. It's built as native ESM (`dist/electron/main.mjs`) because `electron-store` (see below) is ESM-only; `preload.ts` has no such dependency and stays CommonJS (`dist/electron/preload.js`) — Electron's sandboxed preload scripts (`app.enableSandbox()`) cannot load ES modules at all, regardless of file extension, so the two files are bundled by separate `esbuild-electron` invocations with different `--format` flags.
- `app-store.ts` wraps `electron-store` (native ESM `import`, no more CommonJS `require` workaround) and exposes it over IPC (`store:get` / `store:set` / `store:delete`), backing renderer-side persisted settings.
- `ffmpeg-runner/ffmpeg-runner.ts` spawns and owns a single `ffmpeg` child process. The renderer streams `MediaRecorder` output to it chunk-by-chunk over IPC (`ffmpeg:start` / `ffmpeg:video-chunk` / `ffmpeg:stop`, defined in `ffmpeg-runner/messages.ts`); chunks are written straight to the process's stdin rather than to a file. Note: it spawns `ffmpeg` from `PATH` directly — the `ffmpeg-installer` npm dependency is declared but not actually wired in, so a system `ffmpeg` install is required for recording to work.
- `preload.ts` is the only bridge to the renderer, exposing `window.appStore` and `window.recordApi`. Any new main-process capability needs a handler here plus a matching `ipcMain` listener; the renderer-side types for these globals live in `src/renderer.d.ts`.

**Angular renderer (`src/app/`)**
- Standalone components (no `NgModule`); `app.component.ts` is currently the single screen and also does double duty as a scratch/demo area for wiring up the Pixi.js overlay.
- Pixi.js (v8) is driven manually, not through Angular bindings: a `pixi.Application` is async-initialized via `.init()` and a `Container` created in `ngAfterViewInit`, the app's `.canvas` is appended into a template `ElementRef`, and the stage is redrawn via a `requestAnimationFrame` loop (calling `pixiApp.renderer.render(stage)`) that runs `ngZone.runOutsideAngular` to avoid triggering change detection every frame.
- `entities/` holds the custom Pixi display-object classes used to build the on-stream graphics:
  - `timer.ts` — a standalone count-up/count-down clock driven by `requestAnimationFrame`, exposing time and running-state as RxJS observables (`currentTime`, `state`); has no Pixi or Angular dependency itself.
  - `async-text-sprite.ts` (`AsyncText`) — a `pixi.Text` subclass whose content is bound to an `Observable<string | number>` (e.g. the timer, or a form control's `valueChanges`), so it updates itself.
  - `boxed-text.ts` (`BoxedText`) — a `Sprite` combining a `Graphics` background box and a `Text`/`AsyncText` label; redraws itself every frame via `Ticker.shared` so the box always fits the current text width/height.
  - `docked.ts` (`createGridLayout`) — lays a 2D array of `Sprite`s (e.g. several `BoxedText`s) out in a row/column grid, recomputing positions every `Ticker.shared` tick so boxes reflow as their content changes.
- `services/` (all `providedIn: 'root'`):
  - `audio.service.ts` — enumerates non-default audio input devices, builds a per-device `GainNode` and mixes them into one `MediaStreamAudioDestinationNode` via the Web Audio API (multi-mic setups), plus a noise-cancellation filter chain (highpass + compressor).
  - `video.service.ts` — enumerates camera devices and groups them by resolution.
  - `record.service.ts` — wraps `MediaRecorder`; the video track comes from the caller, the audio track is pulled from `AudioService`. Its `start`/`stop`/`ondataavailable` are overridden to call into `window.recordApi` (the preload bridge) instead of the browser defaults, so encoding actually happens in the `ffmpeg` main-process, not in the renderer.
  - `app-store.service.ts` — thin wrapper over `window.appStore` for persisted settings.

When adding a new renderer↔main capability: add the IPC channel name to `electron/ffmpeg-runner/messages.ts` (or a new messages module), handle it in the relevant main-process class, expose it via `contextBridge` in `preload.ts`, and add its type to `src/renderer.d.ts`.

## Future plans

Not yet implemented; noted here for direction when relevant work comes up.

- Split the UI into a pre-game view (settings, rosters, information, etc.) and an in-game view (camera, scene selection, scoreboard, messages).
- Support configuring multiple scenes.
- More widgets: starting lines, game introduction, ranking, stats, etc.
- Various pre-built graphical suites.
- Standardized in-game messages (player info, timeout called, yellow/red card, ...).
- Streaming to YouTube/Facebook/Twitch/Instagram.
- Multi-user collaboration on a single broadcast, with flexible per-user roles/capabilities (e.g. remote camera operator, scoreboard operator, director selecting scenes, messages operator, remote commentator).
- Use pre-recorded videos and instant replays as a video source alongside live cameras.

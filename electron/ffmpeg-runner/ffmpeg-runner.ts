import { ChildProcess, spawn } from 'child_process';
import { join as pathJoin } from 'path';

import { app, ipcMain } from 'electron';
import { buildFFmpegArgs, StreamDestination } from './build-args';
import { START, VIDEO_CHUNK, STOP } from './messages';

export interface StartResult {
  ok: boolean;
  error?: string;
}

export class FFmpegRunner {
  private static process: ChildProcess | null = null;

  private constructor() {}

  static init() {
    ipcMain.handle(START, (_event, destinations: StreamDestination[] = []) =>
      this.start(destinations)
    );
    ipcMain.on(VIDEO_CHUNK, (_event, chunk: ArrayBuffer) => this.record(chunk));
    ipcMain.on(STOP, () => this.stop());
  }

  /**
   * Spawns ffmpeg and resolves once it has either started or failed to start,
   * so the renderer only reports "recording" when there is really an encoder
   * on the other end of the pipe.
   */
  static start(destinations: StreamDestination[] = []): Promise<StartResult> {
    let args: string[];
    try {
      args = buildFFmpegArgs(
        destinations.length ? destinations : [this.defaultDestination()]
      );
    } catch (error) {
      return Promise.resolve({ ok: false, error: (error as Error).message });
    }

    const child = spawn('ffmpeg', args);
    this.process = child;

    child.stdout?.on('data', (data) => console.log(`ffmpeg: ${data}`));
    child.stderr?.on('data', (data) => console.error(`ffmpeg: ${data}`));

    child.on('close', () => this.clear(child));
    child.on('error', () => this.clear(child));

    return new Promise<StartResult>((resolve) => {
      const settle = (result: StartResult) => {
        child.off('spawn', onSpawn);
        child.off('error', onError);
        resolve(result);
      };
      const onSpawn = () => settle({ ok: true });
      const onError = (error: Error) => settle({ ok: false, error: error.message });

      child.once('spawn', onSpawn);
      child.once('error', onError);
    });
  }

  static record(chunk: ArrayBuffer) {
    const child = this.process;
    if (!child || child.killed || child.stdin?.writableEnded) return;
    child.stdin?.write(Buffer.from(chunk));
  }

  /** Ends stdin so ffmpeg can flush and finalise its outputs. */
  static stop() {
    const child = this.process;
    if (!child || child.killed || child.stdin?.writableEnded) return;
    child.stdin?.end();
  }

  private static clear(child: ChildProcess) {
    if (this.process === child) this.process = null;
  }

  private static defaultDestination(): StreamDestination {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      id: 'default-local',
      type: 'local',
      label: 'Local recording',
      enabled: true,
      filePath: pathJoin(app.getPath('videos'), `sports-livestream-${stamp}.mp4`),
    };
  }
}

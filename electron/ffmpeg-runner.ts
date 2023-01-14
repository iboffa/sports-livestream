import { ChildProcess, spawn } from 'child_process';
import { ipcMain } from 'electron';

export const START = 'ffmpeg:start';
export const VIDEO_CHUNK = 'ffmpeg:video-chunk';
export const STOP = 'ffmpeg:stop';

export interface FFmpegOptions {
  youtubeStream: boolean;
  localRecord: boolean;
}

export class FFmpegRunner {
  private static process: ChildProcess | null;

  private constructor() {}

  static init() {
    ipcMain.on(START, (event, options) => this.start(options));
    ipcMain.on(VIDEO_CHUNK, (event, chunk: ArrayBuffer) => this.record(chunk));
    ipcMain.on(STOP, () => this.stop());
  }

  static start(...args: string[]) {
    this.process = spawn('ffmpeg', args);

    this.process.on('finish', () => {
      this.process!.kill('SIGINT');
      this.process = null;
    });

    this.process.on('error', (error) => {
      console.error(error);
    });

    this.process.stdout?.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });
  }

  static record(chunk: ArrayBuffer) {
    if (!this.process!.killed && !this.process!.stdin?.writableEnded)
      this.process!.stdin?.write(Buffer.from(chunk));
  }

  static stop() {
    if (!this.process!.killed) {
      console.log('stdin end');
      this.process!.stdin?.end();
    }
  }
}

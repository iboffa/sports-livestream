import { EventEmitter } from 'events';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('electron', () => ({
  ipcMain: { on: jest.fn(), handle: jest.fn() },
  app: { getPath: jest.fn(() => '/videos') },
}));

import { spawn } from 'child_process';
import { FFmpegRunner } from './ffmpeg-runner';
import { StreamDestination } from './build-args';

/** Mirrors the ChildProcess surface FFmpegRunner touches. */
class FakeProcess extends EventEmitter {
  killed = false;
  written: Buffer[] = [];
  stdin = {
    writableEnded: false,
    write: (b: Buffer) => this.written.push(b),
    end: () => {
      this.stdin.writableEnded = true;
    },
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = () => {
    this.killed = true;
  };
}

const destination: StreamDestination = {
  id: 'l1',
  type: 'local',
  label: 'Local recording',
  enabled: true,
  filePath: '/videos/game.mp4',
};

let proc: FakeProcess;

beforeEach(() => {
  proc = new FakeProcess();
  (spawn as jest.Mock).mockReset().mockReturnValue(proc);
});

/** start() resolves only once the process reports spawned or failed. */
const startAnd = (emit: () => void, dests: StreamDestination[] = [destination]) => {
  const started = FFmpegRunner.start(dests);
  emit();
  return started;
};

describe('FFmpegRunner.start', () => {
  it('spawns ffmpeg with a real argument list built from the destinations', async () => {
    await startAnd(() => proc.emit('spawn'));

    expect(spawn).toHaveBeenCalledWith('ffmpeg', [
      '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac',
      '-f', 'tee', '-map', '0:v', '-map', '0:a',
      '[f=mp4]/videos/game.mp4',
    ]);
  });

  it('reports success once the process has spawned', async () => {
    await expect(startAnd(() => proc.emit('spawn'))).resolves.toEqual({ ok: true });
  });

  it('reports the reason when ffmpeg is not installed', async () => {
    const enoent = Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' });

    await expect(startAnd(() => proc.emit('error', enoent))).resolves.toEqual({
      ok: false,
      error: 'spawn ffmpeg ENOENT',
    });
  });

  it('records to a default file when no destinations are configured', async () => {
    await startAnd(() => proc.emit('spawn'), []);

    const args = (spawn as jest.Mock).mock.calls[0][1] as string[];
    const branch = args.at(-1)!;

    expect(branch.startsWith('[f=mp4]')).toBe(true);
    expect(branch).toContain('videos');
    expect(branch).toMatch(/sports-livestream-.*\.mp4$/);
  });
});

describe('FFmpegRunner.record', () => {
  it('writes chunks to ffmpeg stdin', async () => {
    await startAnd(() => proc.emit('spawn'));

    FFmpegRunner.record(new Uint8Array([1, 2, 3]).buffer);

    expect(proc.written).toEqual([Buffer.from([1, 2, 3])]);
  });

  it('drops chunks that arrive after ffmpeg has exited', async () => {
    await startAnd(() => proc.emit('spawn'));
    proc.emit('close', 0);

    expect(() => FFmpegRunner.record(new Uint8Array([1]).buffer)).not.toThrow();
    expect(proc.written).toEqual([]);
  });

  it('drops chunks that arrive before ffmpeg was started', () => {
    expect(() => FFmpegRunner.record(new Uint8Array([1]).buffer)).not.toThrow();
  });
});

describe('FFmpegRunner.stop', () => {
  it('ends ffmpeg stdin so it can finalise the file', async () => {
    await startAnd(() => proc.emit('spawn'));

    FFmpegRunner.stop();

    expect(proc.stdin.writableEnded).toBe(true);
  });

  it('does not throw when ffmpeg has already exited', async () => {
    await startAnd(() => proc.emit('spawn'));
    proc.emit('close', 0);

    expect(() => FFmpegRunner.stop()).not.toThrow();
  });
});

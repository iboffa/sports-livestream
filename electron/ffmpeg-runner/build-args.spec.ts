import { buildFFmpegArgs, StreamDestination } from './build-args';

const local = (over: Partial<StreamDestination> = {}): StreamDestination => ({
  id: 'l1',
  type: 'local',
  label: 'Local recording',
  enabled: true,
  filePath: '/videos/game.mp4',
  ...over,
});

const rtmp = (over: Partial<StreamDestination> = {}): StreamDestination => ({
  id: 'r1',
  type: 'rtmp',
  label: 'YouTube',
  enabled: true,
  rtmpBaseUrl: 'rtmp://a.rtmp.youtube.com/live2',
  streamKey: 'abcd-1234',
  ...over,
});

describe('buildFFmpegArgs', () => {
  it('reads webm from stdin and encodes once to H.264/AAC', () => {
    expect(buildFFmpegArgs([local()]).slice(0, 10)).toEqual([
      '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac',
    ]);
  });

  it('writes a local destination as an mp4 tee branch', () => {
    expect(buildFFmpegArgs([local({ filePath: '/videos/game.mp4' })])).toEqual([
      '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac',
      '-f', 'tee', '-map', '0:v', '-map', '0:a',
      '[f=mp4]/videos/game.mp4',
    ]);
  });

  it('writes an rtmp destination as an flv branch that ignores its own failure', () => {
    expect(buildFFmpegArgs([rtmp()]).at(-1)).toBe(
      '[f=flv:onfail=ignore]rtmp://a.rtmp.youtube.com/live2/abcd-1234'
    );
  });

  it('fans multiple destinations out of one encode, pipe-separated', () => {
    expect(buildFFmpegArgs([local(), rtmp()]).at(-1)).toBe(
      '[f=mp4]/videos/game.mp4|[f=flv:onfail=ignore]rtmp://a.rtmp.youtube.com/live2/abcd-1234'
    );
  });

  it('omits disabled destinations from the fan-out', () => {
    expect(buildFFmpegArgs([local(), rtmp({ enabled: false })]).at(-1)).toBe(
      '[f=mp4]/videos/game.mp4'
    );
  });

  // ffmpeg's tee muxer treats \ | [ ] as syntax inside an output spec, so an
  // unescaped Windows path makes it silently write nothing and still exit 0.
  it('escapes backslashes so the tee muxer does not eat Windows path separators', () => {
    expect(
      buildFFmpegArgs([local({ filePath: String.raw`C:\videos\game.mp4` })]).at(-1)
    ).toBe(String.raw`[f=mp4]C:\\videos\\game.mp4`);
  });

  it('escapes tee delimiters that are legal in file names', () => {
    expect(
      buildFFmpegArgs([local({ filePath: '/videos/[2026] cup|final.mp4' })]).at(-1)
    ).toBe(String.raw`[f=mp4]/videos/\[2026\] cup\|final.mp4`);
  });

  it('leaves the colons in an rtmp url alone', () => {
    expect(buildFFmpegArgs([rtmp()]).at(-1)).toContain('rtmp://a.rtmp.youtube.com/live2');
  });

  it('refuses to build a command with nothing to write to', () => {
    expect(() => buildFFmpegArgs([local({ enabled: false })])).toThrow(
      'no enabled destinations'
    );
  });
});

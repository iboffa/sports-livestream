export type DestinationType = 'local' | 'rtmp';

export interface StreamDestination {
  id: string;
  type: DestinationType;
  label: string;
  enabled: boolean;
  rtmpBaseUrl?: string; // rtmp-only
  streamKey?: string; // rtmp-only
  filePath?: string; // local-only
}

/**
 * Inside a tee output spec `\ | [ ]` are syntax, so a raw Windows path makes
 * ffmpeg silently write nothing and still exit 0. `:` is left alone — it is
 * not special in the name part, and escaping it would break `rtmp://` urls.
 */
function escapeTeeName(name: string): string {
  return name.replace(/[\\|[\]]/g, (char) => '\\' + char);
}

/**
 * One H.264/AAC encode of the incoming webm stream, fanned out to every
 * enabled destination through ffmpeg's tee muxer. `onfail=ignore` keeps a
 * dropped RTMP connection from taking down the other destinations.
 */
export function buildFFmpegArgs(destinations: StreamDestination[]): string[] {
  const branches = destinations
    .filter((d) => d.enabled)
    .map((d) =>
      d.type === 'local'
        ? `[f=mp4]${escapeTeeName(d.filePath ?? '')}`
        : `[f=flv:onfail=ignore]${escapeTeeName(`${d.rtmpBaseUrl}/${d.streamKey}`)}`
    )
    .join('|');

  if (!branches) {
    throw new Error('Cannot start ffmpeg: no enabled destinations');
  }

  return [
    '-f', 'webm', '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac',
    '-f', 'tee', '-map', '0:v', '-map', '0:a',
    branches,
  ];
}

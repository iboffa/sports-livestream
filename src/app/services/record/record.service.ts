import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioService } from '../audio/audio.service';

@Injectable({
  providedIn: 'root',
})
export class RecordService {
  private audioService = inject(AudioService);

  recording$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private mediaRecorder!: MediaRecorder;
  /** Serialises chunk writes so they reach ffmpeg's stdin in capture order. */
  private pipeline: Promise<void> = Promise.resolve();
  private finalised?: () => void;

  get isRecording$() {
    return this.recording$.asObservable();
  }

  setVideoStream(stream: MediaStream) {
    stream.addTrack(this.audioService.audioTrack);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    });
    this.mediaRecorder.ondataavailable = (event) => this.enqueue(event.data);
    this.mediaRecorder.onstop = () => this.closePipe();
  }

  /**
   * Spawns ffmpeg first and only starts capturing once it is up, so no chunk
   * is produced before there is a pipe to write it to. Resolves false — and
   * stays out of the recording state — if ffmpeg could not be started.
   */
  async start(): Promise<boolean> {
    const result = await window.recordApi.start();
    if (!result.ok) {
      console.error(`Could not start recording: ${result.error}`);
      return false;
    }

    this.mediaRecorder.start(1000);
    this.recording$.next(true);
    return true;
  }

  /** Resolves once the final chunk has been written and ffmpeg told to finalise. */
  async stop(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

    const finalised = new Promise<void>((resolve) => (this.finalised = resolve));
    this.mediaRecorder.stop();
    this.recording$.next(false);
    await finalised;
  }

  private enqueue(chunk: Blob): void {
    this.pipeline = this.pipeline
      .then(() => chunk.arrayBuffer())
      .then((buffer) => window.recordApi.sendChunk(buffer))
      .catch((error) => console.error('Dropped a recording chunk', error));
  }

  /** Queued behind pending writes so ffmpeg's stdin closes after the last chunk. */
  private closePipe(): void {
    this.pipeline = this.pipeline.then(() => {
      window.recordApi.stop();
      this.finalised?.();
      this.finalised = undefined;
    });
  }
}

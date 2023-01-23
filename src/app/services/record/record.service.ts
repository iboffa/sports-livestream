import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioService } from '../audio/audio.service';

@Injectable({
  providedIn: 'root',
})
export class RecordService {
  constructor(private audioService: AudioService) {}

  recording$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private mediaRecorder!: MediaRecorder;

  get isRecording$() {
    return this.recording$.asObservable();
  }

  setVideoStream(stream: MediaStream) {
    stream.addTrack(this.audioService.audioTrack);
    if (this.mediaRecorder){
      this.stop();
    }
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    this.mediaRecorder.start= () => window.recordApi.start();
    this.mediaRecorder.ondataavailable = (event) => this.record(event.data);
    this.mediaRecorder.stop = () => window.recordApi.stop();
  }

  start(): void {
    this.mediaRecorder.start(1000);
    this.recording$.next(true);
  }

  stop(): void {
   this.mediaRecorder.stop();
   this.recording$.next(false);
  }

  private record(chunk: Blob): void {
    chunk.arrayBuffer().then((buffer) => window.recordApi.sendChunk(buffer));
  }
}

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class RecordService {
  constructor() {}

  start(): void {
    window.recordApi.start();
  }

  record(chunk: Blob): void {
    chunk.arrayBuffer().then((buffer) => window.recordApi.sendChunk(buffer));
  }

  stop(): void {
    window.recordApi.stop();
  }
}

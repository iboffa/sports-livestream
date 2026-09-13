import { TestBed } from '@angular/core/testing';
import { RecordService } from './record.service';
import { AudioService } from '../audio/audio.service';
import { waitFor } from '../../../test/utils/wait-for';

/**
 * Mirrors the parts of the real MediaRecorder contract this service depends on:
 * `start(timeslice)` is what makes `dataavailable` fire at all, and `stop()`
 * flushes one last chunk before `onstop`. Methods live on the prototype so that
 * a service overwriting them with its own properties is visible to these tests.
 */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];

  state: 'inactive' | 'recording' = 'inactive';
  timeslices: number[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream, public options?: unknown) {
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number) {
    this.state = 'recording';
    this.timeslices.push(timeslice as number);
  }

  stop() {
    // The real recorder goes inactive synchronously, then queues the final
    // `dataavailable` and `stop` events as a task.
    this.state = 'inactive';
    setTimeout(() => {
      this.emitChunk(new Blob([new Uint8Array([9, 9])]));
      this.onstop?.();
    }, 0);
  }

  /** Drives a chunk the way the real recorder does once per timeslice. */
  emitChunk(data: Blob) {
    this.ondataavailable?.({ data });
  }
}

const audioTrack = { kind: 'audio' } as MediaStreamTrack;

describe('RecordService', () => {
  let service: RecordService;
  let stream: MediaStream;
  let recorder: () => FakeMediaRecorder;

  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    (window as any).MediaRecorder = FakeMediaRecorder;

    window.recordApi = {
      start: jest.fn().mockResolvedValue({ ok: true }),
      sendChunk: jest.fn(),
      stop: jest.fn(),
    };

    stream = { addTrack: jest.fn() } as unknown as MediaStream;
    recorder = () => FakeMediaRecorder.instances[0];

    TestBed.configureTestingModule({
      providers: [
        RecordService,
        { provide: AudioService, useValue: { audioTrack } },
      ],
    });
    service = TestBed.inject(RecordService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('setVideoStream', () => {
    it('should add audioTrack to the stream', () => {
      service.setVideoStream(stream);

      expect(stream.addTrack).toHaveBeenCalledWith(audioTrack);
    });
  });

  describe('start', () => {
    it('starts the underlying recorder with a timeslice so chunks are emitted', async () => {
      service.setVideoStream(stream);

      await service.start();

      expect(recorder().timeslices).toEqual([1000]);
      expect(recorder().state).toBe('recording');
    });

    it('spawns ffmpeg before the recorder, so the pipe exists for the first chunk', async () => {
      const spyOnFfmpegStart = jest.spyOn(window.recordApi, 'start');
      service.setVideoStream(stream);

      await service.start();

      expect(spyOnFfmpegStart).toHaveBeenCalled();
      expect(recorder().timeslices).toEqual([1000]);
    });

    it('should change the recording state to true', async () => {
      service.setVideoStream(stream);

      await service.start();

      expect(service.recording$.getValue()).toBe(true);
    });

    it('does not report recording when ffmpeg failed to start', async () => {
      (window.recordApi.start as jest.Mock).mockResolvedValue({
        ok: false,
        error: 'spawn ffmpeg ENOENT',
      });
      service.setVideoStream(stream);

      await service.start();

      expect(service.recording$.getValue()).toBe(false);
      expect(recorder().state).toBe('inactive');
    });
  });

  describe('recording', () => {
    it('forwards each emitted chunk to the ffmpeg bridge', async () => {
      service.setVideoStream(stream);
      await service.start();

      recorder().emitChunk(new Blob([new Uint8Array([1, 2, 3])]));
      await waitFor(() => (window.recordApi.sendChunk as jest.Mock).mock.calls.length > 0);

      const sent = (window.recordApi.sendChunk as jest.Mock).mock.calls[0][0];
      expect(Array.from(new Uint8Array(sent))).toEqual([1, 2, 3]);
    });
  });

  describe('stop', () => {
    it('should change the recording state to false', async () => {
      service.setVideoStream(stream);
      await service.start();

      await service.stop();

      expect(service.recording$.getValue()).toBe(false);
    });

    it('closes the ffmpeg pipe only after the final chunk has been forwarded', async () => {
      const spyOnSendChunk = jest.spyOn(window.recordApi, 'sendChunk');
      const spyOnFfmpegStop = jest.spyOn(window.recordApi, 'stop');
      service.setVideoStream(stream);
      await service.start();

      await service.stop();

      expect(spyOnSendChunk).toHaveBeenCalled();
      expect(spyOnSendChunk.mock.invocationCallOrder[0]).toBeLessThan(
        spyOnFfmpegStop.mock.invocationCallOrder[0]
      );
    });

    it('resolves only once ffmpeg has been told to finalise the file', async () => {
      service.setVideoStream(stream);
      await service.start();

      await service.stop();

      expect(window.recordApi.stop).toHaveBeenCalled();
    });
  });
});

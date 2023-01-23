import { TestBed } from '@angular/core/testing';
import { RecordService } from './record.service';
import { AudioService } from '../audio/audio.service';

describe('RecordService', () => {
  let service: RecordService;
  let audioService: AudioService;

  let stream: MediaStream;
  let spyOnAddTrack: jest.SpyInstance;

  beforeAll(() => {
    window.MediaStream = jest.fn().mockImplementation(() => ({
      addTrack: jest.fn(),
    }));

    window.MediaRecorder = (jest.fn() as any).mockImplementation(() => ({
      start: jest.fn(),
      ondataavailable: jest.fn(),
      onerror: jest.fn(),
      state: "",
      stop: jest.fn(),
    }));

    window.recordApi = {
      start: jest.fn(),
      stop: jest.fn(),
      record: jest.fn()
    } as any;

    stream = new MediaStream();
    spyOnAddTrack = jest.spyOn(stream, 'addTrack');
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RecordService,
        { provide: AudioService, useValue: { audioTrack: {} } },
      ],
    });
    service = TestBed.inject(RecordService);
    audioService = TestBed.inject(AudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('setVideoStream', () => {
    beforeEach(() => {});
    it('should add audioTrack to the stream', () => {
      service.setVideoStream(stream);
      expect(spyOnAddTrack).toHaveBeenCalledWith(audioService.audioTrack);
    });
  });

  describe('start', () => {
    it('should change the recording state to true', () => {
      service.setVideoStream(stream);
      service.start();
      expect(service.recording$.getValue()).toBeTruthy();
    });
    it('should call window.recordApi.start', () => {
      const spyOnRecordApiStart = jest.spyOn(window.recordApi, 'start')
      service.setVideoStream(stream);
      service.start();
      expect(spyOnRecordApiStart).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should change the recording state to false', () => {
      service.setVideoStream(stream);
      service.start();
      service.stop();
      expect(service.recording$.getValue()).toBeFalsy();
    });
    it('should call mediaRecorder.stop', () => {
      const spyOnRecordApiStop = jest.spyOn(window.recordApi, 'stop')
      service.setVideoStream(stream);
      service.stop();
      expect(spyOnRecordApiStop).toHaveBeenCalled();
    });
  });
});

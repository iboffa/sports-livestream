import { TestBed } from '@angular/core/testing';

import { VideoService } from './video.service';

describe('VideoService', () => {
  let service: VideoService;
  let stoppedTracks: number;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoService);
    stoppedTracks = 0;

    const track = {
      getSettings: () => ({ width: 1920, height: 1080 }),
      stop: () => {
        stoppedTracks += 1;
      },
    };

    (navigator as any).mediaDevices = {
      enumerateDevices: jest.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'cam-1', label: 'Front' },
        { kind: 'videoinput', deviceId: 'cam-2', label: 'Side' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
      ]),
      getUserMedia: jest.fn().mockResolvedValue({
        getVideoTracks: () => [track],
        getTracks: () => [track],
      }),
    };
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('groups cameras by the resolution they report', async () => {
    const cameras = await service.groupCamerasByResolution();

    expect(Object.keys(cameras)).toEqual(['1920x1080']);
    expect(cameras['1920x1080'].map((d) => d.deviceId)).toEqual(['cam-1', 'cam-2']);
  });

  it('releases every camera it opened while probing resolutions', async () => {
    await service.groupCamerasByResolution();

    expect(stoppedTracks).toBe(2);
  });
});

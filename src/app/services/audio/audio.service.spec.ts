import { TestBed } from '@angular/core/testing';
import { filter, firstValueFrom } from 'rxjs';

import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;

  beforeAll(() => {
    (global as any).AudioContext = jest.fn().mockImplementation(() => ({
      currentTime: 0,
      createMediaStreamDestination: jest.fn(() => ({
        stream: { getAudioTracks: () => [] },
        disconnect: jest.fn(),
      })),
      createGain: jest.fn(() => ({
        gain: { setValueAtTime: jest.fn() },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createBiquadFilter: jest.fn(() => ({
        type: '',
        frequency: { value: 0 },
        connect: jest.fn(),
      })),
      createDynamicsCompressor: jest.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: jest.fn(),
      })),
      createMediaStreamSource: jest.fn(() => ({
        connect: jest.fn(),
      })),
    }));

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-1', label: 'Headset' },
          { kind: 'audioinput', deviceId: 'mic-2', label: 'Ambient' },
          { kind: 'audioinput', deviceId: 'default', label: 'Default' },
          { kind: 'videoinput', deviceId: 'cam-1', label: 'Front' },
        ]),
        getUserMedia: jest.fn().mockResolvedValue({} as MediaStream),
      },
      configurable: true,
    });
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('publishes its mixed inputs once the devices have been wired up', async () => {
    const inputs = await firstValueFrom(
      service.audioInputs$.pipe(filter((value) => Object.keys(value).length > 0))
    );

    expect(Object.keys(inputs)).toEqual(['mic-1', 'mic-2']);
    expect(Object.values(inputs).map((input) => input.label)).toEqual([
      'Headset',
      'Ambient',
    ]);
  });
});

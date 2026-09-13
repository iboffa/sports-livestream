import { TestBed } from '@angular/core/testing';
import { PreGameComponent } from './pre-game.component';
import { VideoService } from '../../services/video/video.service';
import { AudioService } from '../../services/audio/audio.service';
import { AppStoreService } from '../../services/app-store/app-store.service';

const cameras = {
  '1920x1080': [{ deviceId: 'cam-1', label: 'Front' } as MediaDeviceInfo],
  '1280x720': [{ deviceId: 'cam-2', label: 'Side' } as MediaDeviceInfo],
};

describe('PreGameComponent', () => {
  let stored: { [key: string]: unknown };

  const render = async () => {
    stored = {};
    (navigator as any).mediaDevices = {
      getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [] }),
    };

    await TestBed.configureTestingModule({
      imports: [PreGameComponent],
      providers: [
        {
          provide: VideoService,
          useValue: { groupCamerasByResolution: jest.fn().mockResolvedValue(cameras) },
        },
        { provide: AudioService, useValue: { audioInputs$: { subscribe: jest.fn() } } },
        {
          provide: AppStoreService,
          useValue: {
            get: (key: string) => stored[key],
            set: (key: string, value: unknown) => {
              stored[key] = value;
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PreGameComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('shows a settings section', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('[data-test="settings-section"]')).toBeTruthy();
  });

  it('shows rosters and information as not-yet-built', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('[data-test="rosters-section"]')?.textContent).toContain(
      'not built yet'
    );
    expect(
      panel.querySelector('[data-test="information-section"]')?.textContent
    ).toContain('not built yet');
  });

  it('lists every camera found, grouped by resolution', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    const options = panel.querySelectorAll('[data-test="camera-option"]');
    expect(Array.from(options).map((o) => o.textContent?.trim())).toEqual([
      'Front',
      'Side',
    ]);
  });

  it('persists the camera the operator picks', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    panel.querySelectorAll<HTMLButtonElement>('[data-test="camera-option"]')[1].click();
    await fixture.whenStable();

    expect(stored['selectedCameraDeviceId']).toBe('cam-2');
  });

  it('shows a self-preview of the chosen camera', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('[data-test="camera-preview"]')).toBeFalsy();

    panel.querySelectorAll<HTMLButtonElement>('[data-test="camera-option"]')[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(panel.querySelector('[data-test="camera-preview"]')).toBeTruthy();
  });
});

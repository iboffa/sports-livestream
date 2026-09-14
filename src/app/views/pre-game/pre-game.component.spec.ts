import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

  const render = async (initialStore: { [key: string]: unknown } = {}) => {
    stored = { ...initialStore };
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
        {
          provide: AudioService,
          useValue: {
            audioInputs$: of({
              'mic-1': { label: 'Headset', gainNode: { gain: { value: 0 } } },
              'mic-2': { label: 'Ambient', gainNode: { gain: { value: 0 } } },
            }),
          },
        },
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

  it('shows a gain slider for every microphone', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    expect(panel.querySelectorAll('[data-test="mic-gain"]').length).toBe(2);
  });

  it('applies and persists a gain change', async () => {
    const fixture = await render();
    const panel = fixture.nativeElement as HTMLElement;

    const slider = panel.querySelectorAll<HTMLInputElement>('[data-test="mic-gain"]')[0];
    slider.value = '0.75';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.componentInstance.micInputs()['mic-1'].gainNode.gain.value).toBe(0.75);
    expect(stored['micGains']).toEqual({ 'mic-1': 0.75 });
  });

  it('restores persisted gains onto the mixer', async () => {
    const fixture = await render({ micGains: { 'mic-2': 0.4 } });
    const panel = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.micInputs()['mic-2'].gainNode.gain.value).toBe(0.4);
    expect(fixture.componentInstance.micInputs()['mic-1'].gainNode.gain.value).toBe(0);

    const sliders = panel.querySelectorAll<HTMLInputElement>('[data-test="mic-gain"]');
    expect(sliders[1].value).toBe('0.4');
  });
});

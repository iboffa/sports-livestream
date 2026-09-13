import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { PreGameComponent } from './views/pre-game/pre-game.component';
import { InGamePanelComponent } from './views/in-game/in-game-panel.component';
import { AppStoreService } from './services/app-store/app-store.service';
import { VideoService } from './services/video/video.service';

describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        // PreGameComponent reads/writes app-store and probes cameras on init;
        // this suite only cares about routing, so stub both out.
        { provide: AppStoreService, useValue: { get: () => undefined, set: () => {} } },
        {
          provide: VideoService,
          useValue: { groupCamerasByResolution: () => Promise.resolve({}) },
        },
      ],
    });
  });

  it('opens the pre-game view for the empty path', async () => {
    const harness = await RouterTestingHarness.create();

    const view = await harness.navigateByUrl('/', PreGameComponent);

    expect(view).toBeInstanceOf(PreGameComponent);
    expect(TestBed.inject(Router).url).toBe('/pre-game');
  });

  it('opens the in-game panel for /in-game', async () => {
    const harness = await RouterTestingHarness.create();

    const view = await harness.navigateByUrl('/in-game', InGamePanelComponent);

    expect(view).toBeInstanceOf(InGamePanelComponent);
  });
});

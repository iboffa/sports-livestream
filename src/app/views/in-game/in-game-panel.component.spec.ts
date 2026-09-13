import { TestBed } from '@angular/core/testing';
import { InGamePanelComponent } from './in-game-panel.component';

describe('InGamePanelComponent', () => {
  const render = async () => {
    await TestBed.configureTestingModule({
      imports: [InGamePanelComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(InGamePanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('marks where the scene picker will mount', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="scenes-section"]')?.textContent).toContain(
      'Scenes'
    );
  });

  it('marks where the message triggers will mount', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="messages-section"]')?.textContent).toContain(
      'Messages'
    );
  });
});

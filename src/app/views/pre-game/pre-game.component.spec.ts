import { TestBed } from '@angular/core/testing';
import { PreGameComponent } from './pre-game.component';

describe('PreGameComponent', () => {
  const render = async () => {
    await TestBed.configureTestingModule({
      imports: [PreGameComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PreGameComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows a settings section', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="settings-section"]')).toBeTruthy();
  });

  it('shows rosters and information as not-yet-built', async () => {
    const panel = await render();

    expect(panel.querySelector('[data-test="rosters-section"]')?.textContent).toContain(
      'not built yet'
    );
    expect(
      panel.querySelector('[data-test="information-section"]')?.textContent
    ).toContain('not built yet');
  });
});

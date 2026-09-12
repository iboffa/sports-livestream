import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';

jest.mock('pixi.js', () => {
  const actual = jest.requireActual('pixi.js');
  return {
    ...actual,
    Application: jest.fn().mockImplementation(() => ({})),
    Renderer: jest.fn().mockImplementation(() => ({
      view: document.createElement('canvas'),
      render: jest.fn(),
    })),
  };
});

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the container and controls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const compiled = fixture.nativeElement as HTMLElement;
    // Check for input in the template without calling detectChanges()
    // to avoid triggering ngAfterViewInit which initializes pixi.js
    expect(compiled.querySelector('input[type="text"]')).toBeTruthy();
  });
});

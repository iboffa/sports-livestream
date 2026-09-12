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
    // Stub HTMLCanvasElement.getContext to return a minimal 2D context
    // to support pixi.js text measurement and rendering code
    const mockCanvasContext = {
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      measureText: jest.fn(() => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      fillText: jest.fn(),
      strokeText: jest.fn(),
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      rect: jest.fn(),
      arc: jest.fn(),
      arcTo: jest.fn(),
      quadraticCurveTo: jest.fn(),
      bezierCurveTo: jest.fn(),
      ellipse: jest.fn(),
      scale: jest.fn(),
      rotate: jest.fn(),
      translate: jest.fn(),
      transform: jest.fn(),
      setTransform: jest.fn(),
      resetTransform: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      clip: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray() })),
      createImageData: jest.fn(() => ({ data: new Uint8ClampedArray() })),
      putImageData: jest.fn(),
      drawImage: jest.fn(),
      createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
      createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
      createPattern: jest.fn(),
      canvas: { width: 640, height: 480 },
    };

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: jest.fn((contextType: string) => {
        if (contextType === '2d') {
          return mockCanvasContext;
        }
        return null;
      }),
      configurable: true,
    });

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
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input[type="text"]')).toBeTruthy();
  });
});

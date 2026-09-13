import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  ChangeDetectionStrategy,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Application, Container, Text } from 'pixi.js';
import { map, Observable, startWith, tap } from 'rxjs';
import { BoxedText } from './entities/boxed-text';
import { createGridLayout } from './entities/docked';
import { Timer } from './entities/timer';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ReactiveFormsModule]
})
export class AppComponent implements AfterViewInit {
  private ngZone = inject(NgZone);

  textContent = new FormControl<string>('Example');

  container = viewChild.required<ElementRef>('container');
  private pixiApp!: Application;
  private stage!: Container;
  private timer = new Timer(
    'down',
    { minutes: 1, seconds: 5, tenths: 0 },
    true
  );
  timer$ = this.timer.currentTime.pipe(
    tap((time) => {
      if (time.minutes === 0 && !this.timer.showTenths) {
        this.timer.showTenths = true;
      }
    }),
    map((time) =>
      time.minutes > 0
        ? `${time.minutes}:${time.seconds.toString().padStart(2, '0')}`
        : `${time.seconds.toString().padStart(2, '0')}.${time.tenths}`
    )
  );
  status = toSignal(this.timer.state, { initialValue: 'stopped' as const });

  async ngAfterViewInit() {
    this.pixiApp = new Application();
    await this.pixiApp.init({
      width: 640,
      height: 480,
      backgroundColor: 0xffffff,
      antialias: true,
    });
    this.stage = new Container();
    this.container().nativeElement.appendChild(this.pixiApp.canvas);

    const timeBox = new BoxedText({
      text: this.timer$,
      minWidth: new Text({ text: '188:88', style: { fontSize: 14 } }).width,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });
    const testName = new BoxedText({
      // @ts-ignore
      text: this.textContent.valueChanges.pipe(startWith(this.textContent.value!)) as Observable<string>,
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });


    const testName2 = new BoxedText({
      text: 'Test',
      background: 0x00000,
      padding: 5,
      textStyle: { fill: '#ffffff', fontSize:14 },
    });

    const block = createGridLayout([[timeBox, testName, testName2]]);
    this.stage.addChild(block);

    this.ngZone.runOutsideAngular(() => this.animate());

  }

  startTimer() {
    this.timer.start();
  }
  stopTimer() {
    this.timer.stop();
  }

  private animate() {
    this.pixiApp.renderer.render(this.stage);

    // Request the next animation frame
    requestAnimationFrame(() => this.animate());
  }
}

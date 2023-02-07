import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Application, Renderer, Container, Text, TextStyle } from 'pixi.js';
import { map, Observable, startWith, tap } from 'rxjs';
import { BoxedText } from './entities/boxed-text';
import { createGridLayout } from './entities/docked';
import { Timer } from './entities/timer';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
})
export class AppComponent implements AfterViewInit {

  textContent = new FormControl<string>('Example');

  @ViewChild('container') container!: ElementRef;
  pixiApp: Application = new Application({
    width: 640,
    height: 480,
    antialias: true
  });
  private renderer!: Renderer;
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
  status$ = this.timer.state;
  constructor(private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.renderer = new Renderer({
      width: 640,
      height: 480,
      backgroundColor: 0xffffff,
    });
    this.stage = new Container();
    this.container.nativeElement.appendChild(this.renderer.view);

    const timeBox = new BoxedText({
      text: this.timer$,
      minWidth: new Text('188:88', {fontSize:14}).width,
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
    this.renderer.render(this.stage);

    // Request the next animation frame
    requestAnimationFrame(() => this.animate());
  }
}

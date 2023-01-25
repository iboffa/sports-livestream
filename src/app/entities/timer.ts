import { BehaviorSubject, distinctUntilChanged, filter, share } from 'rxjs';

export interface Time {
  minutes: number;
  seconds: number;
  tenths?: number;
}

export class Timer {
  private timerId!: number;
  private time!: number;
  private directionUp: boolean;
  private lastTick!: number;
  private $time: BehaviorSubject<Time>;
  private $state: BehaviorSubject<'stopped' | 'running' | 'expired'> =
    new BehaviorSubject<'stopped' | 'running' | 'expired'>('stopped');
  showTenths: boolean;

  constructor(
    direction: 'up' | 'down',
    initialTime: Time = { minutes: 0, seconds: 0 },
    showTenths: boolean
  ) {
    initialTime.tenths = 0;
    this.setTime(initialTime);
    this.directionUp = direction === 'up';
    this.$time = new BehaviorSubject<Time>(initialTime);
    this.showTenths = showTenths;
  }

  get currentTime() {
    return this.$time.pipe(
      share(),
      filter((time) => time.minutes >= 0 && time.seconds >= 0),
      distinctUntilChanged(
        (a, b) =>
          a.minutes === b.minutes &&
          a.seconds === b.seconds &&
          (!this.showTenths || a?.tenths === b?.tenths)
      )
    );
  }

  get state() {
    return this.$state.pipe(share());
  }

  start(): void {
    if (this.time > 0 || this.directionUp) {
      this.lastTick = performance.now();
      this.$state.next('running');
      this.timerId = requestAnimationFrame(this.timeRunner.bind(this));
    }
  }

  stop(expired?: boolean): void {
    cancelAnimationFrame(this.timerId);
    this.$state.next(expired ? 'expired' : 'stopped');
  }

  setTime(time: Time) {
    this.time = time.minutes * 60000 + time.seconds * 1000;
  }

  private timeRunner() {
    const currentTime = performance.now();
    if (this.directionUp) {
      this.time += currentTime - this.lastTick;
    } else {
      if (this.time > 0) {
        this.time -= currentTime - this.lastTick;
      } else {
        this.time = 0;
        this.stop(true);
      }
    }
    const minutes = Math.floor(this.time / 60000);
    const seconds = Math.floor((this.time % 60000) / 1000);
    const tenths = Math.floor((this.time % 1000) / 100);
    if (this.showTenths) {
      this.$time.next({ minutes, seconds, tenths });
    } else {
      this.$time.next({ minutes, seconds });
    }
    this.lastTick = performance.now();
    if (this.$state.value === 'running')
      this.timerId = requestAnimationFrame(this.timeRunner.bind(this));
  }
}

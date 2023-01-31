import {
  Graphics,
  IDestroyOptions,
  ITextStyle,
  Sprite,
  Text,
  TextStyle,
  Ticker,
} from 'pixi.js';
import { Observable, Subscription } from 'rxjs';
import { AsyncText } from './async-text-sprite';

export interface BoxedTextOptions {
  text: string | number | Observable<string | number>;
  background: number;
  padding?: number;
  minWidth?: number;
  textStyle?: Partial<ITextStyle>;
  colspan?: number;
}

export class BoxedText extends Sprite {
  private _text: Text | AsyncText;
  private _box: Graphics;
  private _options: BoxedTextOptions;
  private _textSub!: Subscription;

  override get width() {
    return this._box.width;
  }

  override get height() {
    return this._box.height;
  }

  constructor(options: BoxedTextOptions) {
    super();

    this._options = options;
    if (!options.colspan) {
      this._options.colspan = 1;
    }
    this._text =
      this._options.text instanceof Observable<string | number>
        ? new AsyncText(this._options.text)
        : new Text();
    this._box = new Graphics();


    Ticker.shared.add(()=> this.draw())

    this.addChild(this._box);
    this.addChild(this._text);

    if (this._text instanceof AsyncText) {
      this._textSub = this._text.asyncText.subscribe((text) => {
        this.updateText(text)
      });
    }
  }

  update(options: Partial<BoxedTextOptions>) {
    this._options = { ...this._options, ...options };
  }

  updateText(text: string|number) {
    this.update({ text });
  }

  private draw() {
    this._box.clear();
    const padding = this._options.padding ?? 0;
    if (!(this._options.text instanceof Observable<string | number>))
      this._text.text = this._options.text;
    if (this._options.textStyle)
      this._text.style = new TextStyle(this._options.textStyle);

    this._box.beginFill(this._options.background);
    const width = Math.max(this._options.minWidth ?? 0, this._text.width + 2 * padding);
    console.log(width);
    this._box.drawRect(0, 0, width, this._text.height + 2 * padding);
    this._box.endFill();
    this.centerText();
  }

  override destroy(options?: boolean | IDestroyOptions | undefined): void {
    this._textSub?.unsubscribe();
  }

  private centerText() {
    const diffX = this._box.width / 2 - this._text.width / 2;
    const diffY = this._box.height / 2 - this._text.height / 2;

    this._text.x = diffX;
    this._text.y = diffY;
  }
}

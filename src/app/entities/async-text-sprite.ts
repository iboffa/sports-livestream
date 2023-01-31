
import { ICanvas, IDestroyOptions, ITextStyle, Text, TextStyle } from 'pixi.js';
import { Observable, Subscription } from 'rxjs';

export class AsyncText extends Text {
  asyncText: Observable<string | number>;
  textSub: Subscription;
  constructor(
    text: Observable<string|number>,
    style?: Partial<ITextStyle> | TextStyle,
    canvas?: ICanvas
  ) {
    super('', style, canvas);
    this.asyncText = text;
    this.textSub = text.subscribe((t) => (this.text = t));
  }

  override destroy(options?: boolean | IDestroyOptions | undefined): void {
    this.textSub.unsubscribe();
    super.destroy(options);
  }
}

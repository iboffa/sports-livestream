
import { DestroyOptions, Text, TextStyle, TextStyleOptions } from 'pixi.js';
import { Observable, Subscription } from 'rxjs';

export class AsyncText extends Text {
  asyncText: Observable<string | number>;
  textSub: Subscription;
  constructor(
    text: Observable<string | number>,
    style?: Partial<TextStyleOptions> | TextStyle
  ) {
    super({ text: '', style });
    this.asyncText = text;
    this.textSub = text.subscribe((t) => (this.text = String(t)));
  }

  override destroy(options?: DestroyOptions): void {
    this.textSub.unsubscribe();
    super.destroy(options);
  }
}

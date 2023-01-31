import { Sprite, Container, Ticker } from "pixi.js";

export function createGridLayout(children: Sprite[][]) {
  const container = new Container();

  Ticker.shared.add(()=>{
    let currentY = 0;
    children.forEach((row, index) => {
    let currentX = 0;
    row.forEach((box) => {
      box.x = currentX;
      box.y = currentY;
      currentX += box.width;
    });
    currentY += row[index].height;
})});

  children.forEach((row) => {
    row.forEach((box) => {
      container.addChild(box);
    });
  });

  return container;
}

import * as PIXI from "pixi.js";

interface MarqueeOptions {
  thickness?: number;
  speed?: number;
  dash?: number;
  dashSpace?: number;
  fillStyle?: string | CanvasGradient | CanvasPattern;
}

export class Marquee extends PIXI.Container {
  thickness = 2;

  speed = 0.2;

  dash = 2;

  dashSpace = 2;

  fillStyle: string | CanvasGradient | CanvasPattern = "white";

  time = 0;

  topLine: PIXI.TilingSprite;

  leftLine: PIXI.TilingSprite;

  rightLine: PIXI.TilingSprite;

  bottomLine: PIXI.TilingSprite;

  constructor(options: MarqueeOptions) {
    super();

    this.thickness = options?.thickness || this.thickness;
    this.dash = options?.dash || this.dash;
    this.dashSpace = options?.dashSpace || this.dashSpace;
    this.speed = options?.speed || this.speed;
    this.fillStyle = options?.fillStyle || this.fillStyle;

    // Draw a 4 x 4 texture as a grid
    const canvas = document.createElement("canvas");
    canvas.width = this.dash + this.dashSpace;
    canvas.height = this.dash + this.dashSpace;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = this.fillStyle;
      ctx.fillRect(0, 0, this.dash, this.dash);
    }
    const texture = PIXI.Texture.from(canvas, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    this.topLine = new PIXI.TilingSprite(texture, 100, this.thickness);
    this.leftLine = new PIXI.TilingSprite(texture, this.thickness, 100);
    this.rightLine = new PIXI.TilingSprite(texture, this.thickness, 100);
    this.bottomLine = new PIXI.TilingSprite(texture, 100, this.thickness);
    this.setSize(0, 0, 100, 100);
    this.addChild(this.topLine, this.leftLine, this.rightLine, this.bottomLine);
  }

  setSize(x: number, y: number, width: number, height: number): void {
    const l = this.thickness;
    this.topLine.position.set(x - l, y - l);
    this.leftLine.position.set(x - l, y);
    this.rightLine.position.set(x + width, y);
    this.bottomLine.position.set(x - l, y + height);

    this.topLine.width = width + l * 2;
    this.bottomLine.width = width + l * 2;
    this.leftLine.height = height;
    this.rightLine.height = height;
  }

  update(): void {
    if (this.visible) {
      this.time += this.speed;
      const size = this.dash + this.dashSpace;
      this.topLine.tilePosition.x = this.time % size;
      this.bottomLine.tilePosition.x = -this.time % size;
      this.leftLine.tilePosition.y = -this.time % size;
      this.rightLine.tilePosition.y = this.time % size;
    }
  }
}

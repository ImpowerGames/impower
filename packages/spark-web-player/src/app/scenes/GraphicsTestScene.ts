import { Graphics, Sprite } from "pixi.js";
import { Scene } from "../Scene";

export default class GraphicsTestScene extends Scene {
  protected _time = 0;

  protected _sprite!: Sprite;

  override async onLoad() {
    const graphics = new Graphics();

    // Rectangle
    graphics.rect(50, 50, 100, 100);
    graphics.fill(0xde3249);

    // Render the graphic to a texture
    const renderTexture = this.app.renderer?.generateTexture({
      target: graphics,
      antialias: true,
    });

    // Create a sprite
    this._sprite = new Sprite(renderTexture);

    // Center the sprite's anchor point
    this._sprite.anchor.set(0.5);

    // Move the sprite to the center of the screen
    this._sprite.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );

    return [this._sprite];
  }

  override onUpdate(elapsedTime: number) {
    const beatPeriod = 1.0;
    const beatProgress = (elapsedTime % beatPeriod) / beatPeriod;
    const scale = 1 + 0.5 * Math.sin(beatProgress * 2 * Math.PI);
    if (this._sprite) {
      this._sprite.scale.set(scale);
    }
  }

  override onResize(width: number, height: number): void {
    this._sprite.position.set(width / 2, height / 2);
  }
}

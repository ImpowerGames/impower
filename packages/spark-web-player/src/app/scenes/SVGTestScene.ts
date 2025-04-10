import { Graphics, GraphicsContext, Sprite } from "pixi.js";
import { Scene } from "../Scene";

const logo = `
<svg
  width="100%" height="100%" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/"
  style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
  <clipPath id="_clip1">
    <path
      d="M-0.008,16c0,-16 0,-16 16.004,-16c16.004,-0 16.004,-0 16.004,16c0,16 0,16 -16.004,16c-16.004,0 -16.004,0 -16.004,-16"
      clip-rule="nonzero" />
  </clipPath>
  <g clip-path="url(#_clip1)">
    <path
      d="M29.963,13.382c-1.974,0.083 -6.921,0.707 -9.488,-1.86c-2.567,-2.566 -1.943,-7.512 -1.86,-9.486c0.04,-0.959 0.912,-2.036 2.037,-2.036l9.311,0c1.124,0 2.037,0.912 2.037,2.036l0,9.309c0,1.125 -1.078,1.997 -2.037,2.037Z"
      style="fill:#fa9900;" />
    <path
      d="M2.037,18.618c1.974,-0.083 6.921,-0.707 9.488,1.86c2.567,2.566 1.943,7.512 1.86,9.486c-0.04,0.959 -0.912,2.036 -2.037,2.036l-9.311,0c-1.124,0 -2.037,-0.912 -2.037,-2.036l0,-9.309c0,-1.125 1.078,-1.997 2.037,-2.037Z"
      style="fill:#02d084;" />
    <path
      d="M2.037,0.008l11.546,-0c0.824,-0 1.567,0.495 1.882,1.256c0.315,0.761 0.211,3.688 -5.154,9.052c-5.686,5.684 -8.293,5.468 -9.054,5.153c-0.761,-0.315 -1.257,-1.058 -1.257,-1.882l0,-11.543c0,-1.124 0.913,-2.036 2.037,-2.036Z"
      style="fill:#ff3f77;" />
    <path
      d="M29.956,31.992l-11.547,0c-0.824,0 -1.566,-0.495 -1.882,-1.256c-0.315,-0.761 -0.211,-3.688 5.155,-9.052c5.685,-5.684 8.292,-5.468 9.053,-5.153c0.762,0.315 1.257,1.058 1.257,1.882l0,11.543c0,1.124 -0.912,2.036 -2.036,2.036Z"
      style="fill:#13bdfe;" />
  </g>
</svg>
`;

export default class SVGTestScene extends Scene {
  protected _time = 0;

  protected _sprite!: Sprite;

  override async onLoad() {
    // Load the graphic
    const logoContext = new GraphicsContext().svg(logo);
    const logoGraphic = new Graphics(logoContext);

    // Render the graphic to a texture
    const renderTexture = this.app.renderer?.generateTexture({
      target: logoGraphic,
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
    const size = 0.05;
    const speed = 0.005;
    const scale = 1 + size * Math.sin(elapsedTime * speed);
    this._sprite.scale.set(scale);
  }

  override onResize(width: number, height: number): void {
    this._sprite.position.set(width / 2, height / 2);
  }
}

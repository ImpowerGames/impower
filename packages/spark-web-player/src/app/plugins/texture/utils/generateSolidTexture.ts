import { ColorSource, Graphics, Renderer, Texture } from "pixi.js";

export const generateSolidTexture = (
  renderer: Renderer,
  width: number,
  height: number,
  color: ColorSource = 0xffffff
): Texture => {
  const gfx = new Graphics();
  gfx.rect(0, 0, width, height).fill(color);
  const texture = renderer.generateTexture(gfx);
  gfx.destroy();
  return texture;
};

import { Texture } from "pixi.js";

export const DEFAULT_PIXELS_PER_UNIT = 32;

export class SparkTexture extends Texture {
  static create(
    width: number = DEFAULT_PIXELS_PER_UNIT,
    height: number = DEFAULT_PIXELS_PER_UNIT
  ): SparkTexture {
    const texture = SparkTexture.WHITE.clone();
    texture.orig.width = width ?? DEFAULT_PIXELS_PER_UNIT;
    texture.orig.height = height ?? DEFAULT_PIXELS_PER_UNIT;
    return texture;
  }
}

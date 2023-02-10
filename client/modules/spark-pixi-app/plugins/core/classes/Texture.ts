import { Texture as _Texture } from "@pixi/core";

export const DEFAULT_PIXELS_PER_UNIT = 32;

export class Texture extends _Texture {
  static create(
    width: number = DEFAULT_PIXELS_PER_UNIT,
    height: number = DEFAULT_PIXELS_PER_UNIT
  ): Texture {
    const texture = Texture.WHITE.clone();
    texture.orig.width = width ?? DEFAULT_PIXELS_PER_UNIT;
    texture.orig.height = height ?? DEFAULT_PIXELS_PER_UNIT;
    return texture;
  }
}

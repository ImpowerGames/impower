import {
  BaseTexture,
  CanvasResource,
  Resource,
  settings,
  Texture as _Texture,
} from "@pixi/core";

export const DEFAULT_PIXELS_PER_UNIT = 32;

const removeAllHandlers = (tex: any): void => {
  tex.destroy = function _emptyDestroy(): void {
    /* empty */
  };
  tex.on = function _emptyOn(): void {
    /* empty */
  };
  tex.once = function _emptyOnce(): void {
    /* empty */
  };
  tex.emit = function _emptyEmit(): void {
    /* empty */
  };
};

export class Texture<R extends Resource = Resource> extends _Texture<R> {
  private static _white: Texture<CanvasResource>;

  static create(
    width: number = DEFAULT_PIXELS_PER_UNIT,
    height: number = DEFAULT_PIXELS_PER_UNIT
  ): Texture {
    const texture = Texture.WHITE.clone();
    texture.orig.width = width ?? DEFAULT_PIXELS_PER_UNIT;
    texture.orig.height = height ?? DEFAULT_PIXELS_PER_UNIT;
    return texture;
  }

  /** A white texture of 32x32 size, used for graphics and other things Can not be destroyed. */
  public static override get WHITE(): Texture<CanvasResource> {
    const width = 32;
    const height = 32;
    if (!Texture._white) {
      const canvas = settings.ADAPTER.createCanvas(width, height);
      const context = canvas.getContext("2d");

      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);

      Texture._white = new Texture(BaseTexture.from(canvas));
      removeAllHandlers(Texture._white);
      removeAllHandlers(Texture._white.baseTexture);
    }

    return Texture._white;
  }
}

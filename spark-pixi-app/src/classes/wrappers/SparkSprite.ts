import { Sprite3d } from "pixi-projection";
import { Resource, Texture } from "pixi.js";

export class SparkSprite extends Sprite3d {
  constructor(texture: Texture<Resource>) {
    super(texture);
  }
}

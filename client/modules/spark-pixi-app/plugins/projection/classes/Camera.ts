import { Renderer } from "@pixi/core";
import { Camera as _Camera } from "pixi3d/pixi7";

export class Camera extends _Camera {
  /** Main camera which is used by default. */
  static override main: Camera;

  constructor(renderer: Renderer) {
    super(renderer);
    if (!Camera.main) {
      Camera.main = this;
    }
  }
}

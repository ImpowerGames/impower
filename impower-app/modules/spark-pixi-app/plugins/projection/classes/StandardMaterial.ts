import { StandardMaterial as _StandardMaterial } from "pixi3d/pixi7";
import { Camera } from "./Camera";
import { Color } from "./Color";
import { Material } from "./Material";

export class StandardMaterial extends _StandardMaterial implements Material {
  override camera?: Camera;

  constructor(color?: string | number) {
    super();
    if (color != null) {
      this.baseColor = Color.fromHex(color);
      this.unlit = true;
    }
  }
}

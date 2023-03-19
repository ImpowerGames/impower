import { Material as _Material } from "pixi3d/pixi7";
import { Camera } from "./Camera";
import { Color } from "./Color";

export class Material extends _Material {
  camera?: Camera;

  baseColor?: Color;

  unlit?: boolean;
}

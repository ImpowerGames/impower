import { Group } from "@pixi/layers";
import { DisplayObject } from "pixi.js";

export class SparkGroup extends Group {
  constructor(
    zIndex?: number,
    sorting?: boolean | ((displayObject: DisplayObject) => void)
  ) {
    super(zIndex, sorting);
  }
}

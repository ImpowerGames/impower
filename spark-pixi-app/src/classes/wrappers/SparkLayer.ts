import { Layer } from "@pixi/layers";
import { SparkGroup } from "./SparkGroup";

export class SparkLayer extends Layer {
  constructor(group?: SparkGroup) {
    super(group);
  }
}

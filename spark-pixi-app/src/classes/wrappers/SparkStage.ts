import { Stage } from "@pixi/layers";
import { SparkGroup } from "./SparkGroup";

export class SparkStage extends Stage {
  constructor(group?: SparkGroup) {
    super(group);
  }
}

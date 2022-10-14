import * as PIXI from "pixi.js";
import { registerPixiInspector } from "../../utils/registerPixiInspector";
import { SparkStage } from "./SparkStage";

export interface SparkApplicationOptions extends PIXI.IApplicationOptions {
  startPaused?: boolean;
  maxFPS?: number;
  onLoaded?: () => void;
}

export class SparkApplication extends PIXI.Application {
  stage: SparkStage;

  constructor(options?: SparkApplicationOptions) {
    super(options);
    this.stage = new SparkStage();
    this.ticker.maxFPS = options?.maxFPS;
    PIXI.utils.destroyTextureCache();
    registerPixiInspector();
  }
}

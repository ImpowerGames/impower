import * as PIXI from "pixi.js";
import { registerPixiInspector } from "../../utils/registerPixiInspector";
import { SparkStage } from "./SparkStage";

export interface SparkApplicationOptions {
  startPaused?: boolean;
  maxFPS?: number;
  onLoaded?: () => void;
  autoStart?: boolean;
  resizeTo?: HTMLElement;
  width?: number;
  height?: number;
  view?: HTMLCanvasElement;
  useContextAlpha?: boolean | "notMultiplied";
  autoDensity?: boolean;
  antialias?: boolean;
  resolution?: number;
  preserveDrawingBuffer?: boolean;
  clearBeforeRender?: boolean;
  backgroundColor?: number;
  backgroundAlpha?: number;
  powerPreference?: WebGLPowerPreference;
}

export class SparkApplication extends PIXI.Application {
  override stage: SparkStage;

  constructor(options?: SparkApplicationOptions) {
    super(options);
    this.stage = new SparkStage();
    this.ticker.maxFPS = options?.maxFPS || 60;
    PIXI.utils.destroyTextureCache();
    registerPixiInspector();
  }

  override resize(): void {
    super.resize();
  }
}

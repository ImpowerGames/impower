import * as PIXI from "pixi.js";
import { registerPixiInspector } from "../../utils/registerPixiInspector";
import { SparkStage } from "./SparkStage";

export interface SparkApplicationOptions {
  startPaused?: boolean;
  maxFPS?: number;
  onLoaded?: () => void;
  autoStart?: boolean;
  sharedTicker?: boolean;
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

  override get view(): HTMLCanvasElement {
    return super.view;
  }

  override get ticker(): PIXI.Ticker {
    return super.ticker;
  }

  constructor(options?: SparkApplicationOptions) {
    super(options);
    this.stage = new SparkStage();
    this.ticker.maxFPS = options?.maxFPS || 60;
    PIXI.utils.destroyTextureCache();
    registerPixiInspector();
  }

  override stop(): void {
    super.stop();
  }

  override start(): void {
    super.start();
  }

  override destroy(
    removeView?: boolean | undefined,
    stageOptions?: boolean | PIXI.IDestroyOptions | undefined
  ): void {
    super.destroy(removeView, stageOptions);
  }

  override resize(): void {
    super.resize();
  }
}

import { Application, IDestroyOptions, utils } from "pixi.js";
import { registerPixiInspector } from "../../utils/registerPixiInspector";
import { SparkAssets } from "./SparkAssets";

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

export class SparkApplication extends Application {
  private _assets: SparkAssets = new SparkAssets();

  public get assets(): SparkAssets {
    return this._assets;
  }

  constructor(options?: SparkApplicationOptions) {
    super(options);
    this.ticker.maxFPS = options?.maxFPS || 60;
    utils.destroyTextureCache();
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
    stageOptions?: boolean | IDestroyOptions | undefined
  ): void {
    super.destroy(removeView, stageOptions);
  }

  override resize(): void {
    super.resize();
  }
}

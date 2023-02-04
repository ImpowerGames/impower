import { Application, IDestroyOptions, utils } from "pixi.js";
import { SparkCameraOrbitControl } from "../../plugins/projection";
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
  protected _assets: SparkAssets = new SparkAssets();

  public get assets(): SparkAssets {
    return this._assets;
  }

  protected _dolly: SparkCameraOrbitControl;

  public get dolly(): SparkCameraOrbitControl {
    return this._dolly;
  }

  constructor(options?: SparkApplicationOptions) {
    super(options);
    this.ticker.maxFPS = options?.maxFPS || 60;
    utils.destroyTextureCache();
    registerPixiInspector();
    this.setupCamera();
  }

  protected setupCamera(): void {
    this._dolly = new SparkCameraOrbitControl(this.view as HTMLCanvasElement);
  }

  override stop(): void {
    if (this) {
      super.stop();
    }
  }

  override start(): void {
    if (this) {
      super.start();
    }
  }

  override destroy(
    removeView?: boolean | undefined,
    stageOptions?: boolean | IDestroyOptions | undefined
  ): void {
    if (this) {
      super.destroy(removeView, stageOptions);
    }
  }

  override resize(): void {
    if (this) {
      super.resize();
    }
  }
}

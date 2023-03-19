import { Application as _Application } from "@pixi/app";
import { Assets } from "../../assets";
import { destroyTextureCache } from "../../core";
import { IDestroyOptions } from "../../display";
import { CameraOrbitControl } from "../../projection";

export interface ApplicationOptions {
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

export class Application extends _Application {
  protected _assets: Assets = new Assets();

  public get assets(): Assets {
    return this._assets;
  }

  protected _dolly: CameraOrbitControl;

  public get dolly(): CameraOrbitControl {
    return this._dolly;
  }

  constructor(options?: ApplicationOptions) {
    super(options);
    this.ticker.maxFPS = options?.maxFPS || 60;
    destroyTextureCache();
    this.setupCamera();
  }

  protected setupCamera(): void {
    this._dolly = new CameraOrbitControl(this.view as HTMLCanvasElement);
    this._dolly.autoUpdate = false;
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
    if (this._dolly) {
      this._dolly.destroy();
    }
  }

  override resize(): void {
    if (this) {
      super.resize();
    }
  }
}

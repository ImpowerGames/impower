import { SparkContext } from "../../../../spark-engine";
import { LogicScene } from "./scenes/LogicScene";
import { PreviewScene } from "./scenes/PreviewScene";
import { SoundScene } from "./scenes/SoundScene";
import { SparkScene } from "./SparkScene";
import {
  SparkApplication,
  SparkApplicationOptions,
} from "./wrappers/SparkApplication";
import { SparkContainer } from "./wrappers/SparkContainer";

export class SparkGameApp {
  private _parent: HTMLElement | null;

  public get parent(): HTMLElement | null {
    return this._parent;
  }

  private _app: SparkApplication;

  public get app(): SparkApplication {
    return this._app;
  }

  private _context: SparkContext | undefined;

  public get context(): SparkContext | undefined {
    return this._context;
  }

  private _scenes: SparkScene[] = [];

  public get scenes(): SparkScene[] {
    return this._scenes;
  }

  private _resizeObserver: ResizeObserver;

  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  private _entities: Record<string, SparkContainer> = {};

  public get entities(): Record<string, SparkContainer> {
    return this._entities;
  }

  private _timeMS = 0;

  constructor(
    domElementId: string,
    context?: SparkContext,
    options?: SparkApplicationOptions
  ) {
    this._parent = document.getElementById(domElementId);

    this._app = new SparkApplication({
      backgroundColor: 0x000000,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      resizeTo: this._parent || undefined,
      ...(options || {}),
    });
    this._parent = document.getElementById(domElementId);
    this._resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        this.app.resize();
        this.scenes.forEach((scene) => {
          scene.resize();
        });
      }
    });
    if (this._parent) {
      this._parent.appendChild(this.app.view);
    }

    this._context = context;
    if (this.context) {
      this.context.init();
    }

    if (context) {
      if (context?.editable) {
        this._scenes = [
          // new MainScene(context, this.app, this.entities),
          new PreviewScene(context, this.app, this.entities),
        ];
      } else {
        this._scenes = [
          // new MainScene(context, this.app, this.entities),
          new SoundScene(context, this.app, this.entities),
          new LogicScene(context, this.app, this.entities),
        ];
      }
    }

    this.start(!context?.editable && !options?.startPaused, options?.onLoaded);
  }

  private async start(
    startTicker?: boolean,
    onLoaded?: () => void
  ): Promise<void> {
    await Promise.all(this.scenes.map((scene) => scene.load()));
    this.scenes.forEach((scene) => {
      scene.init();
    });
    this.scenes.forEach((scene) => {
      scene.start();
    });

    this.app.ticker.add(this.update, this);

    if (this.context) {
      await this.context.start();
    }

    if (startTicker) {
      this.app.start();
    } else {
      this.app.ticker.update();
      this.app.stop();
    }

    onLoaded?.();
  }

  destroy(removeView?: boolean, stageOptions?: boolean): void {
    this.resizeObserver.disconnect();
    if (this.context) {
      this.context.end();
    }
    if (this.app && this.app?.cancelResize) {
      this.app.destroy(removeView, stageOptions);
    }
  }

  pause(): void {
    this.app.stop();
  }

  resume(): void {
    this.app.start();
  }

  update(): void {
    const deltaMS = this.app.ticker?.deltaMS || 0;
    this._timeMS += deltaMS;
    if (this.app) {
      this.scenes.forEach((scene) => {
        scene.update(this._timeMS, deltaMS);
      });
    }
  }
}

import { SparkContext } from "../../spark-engine";
import { Scene } from "./Scene";
import { AudioScene } from "./scenes/AudioScene";
import { InputScene } from "./scenes/InputScene";
import { LogicScene } from "./scenes/LogicScene";
import { MainScene } from "./scenes/MainScene";
import { PreviewScene } from "./scenes/PreviewScene";
import {
  SparkApplication,
  SparkApplicationOptions,
} from "./wrappers/SparkApplication";

export const responsiveBreakpoints: Record<string, number> = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

export class GameApp {
  private _parent: HTMLElement | null;

  public get parent(): HTMLElement | null {
    return this._parent;
  }

  private _app: SparkApplication;

  public get app(): SparkApplication {
    return this._app;
  }

  private _sparkContext: SparkContext | undefined;

  public get sparkContext(): SparkContext | undefined {
    return this._sparkContext;
  }

  private _scenes: Scene[] = [];

  public get scenes(): Scene[] {
    return this._scenes;
  }

  private _resizeObserver: ResizeObserver;

  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  private _time = 0;

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
      resizeTo: this._parent || undefined,
      ...(options || {}),
    });

    this._resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        this.app.resize();
        this.scenes.forEach((scene) => {
          scene.resize();
        });
        const width = entry.contentRect?.width;
        const keys = Object.keys(responsiveBreakpoints);
        let className = "";
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i];
          className += `${k} `;
          if (responsiveBreakpoints[k] > width) {
            break;
          }
        }
        className = className.trim();
        if (
          entry.target.parentElement &&
          entry.target.parentElement.className !== className
        ) {
          entry.target.parentElement.className = className;
        }
      }
    });
    if (this._parent) {
      this._parent.appendChild(this.app.view);
      this.resizeObserver.observe(this._parent);
    }

    this._sparkContext = context;
    if (this.sparkContext) {
      this.sparkContext.init();
    }

    if (context) {
      if (context?.editable) {
        this._scenes = [
          new MainScene(context, this.app),
          new PreviewScene(context, this.app),
        ];
      } else {
        this._scenes = [
          new MainScene(context, this.app),
          new AudioScene(context, this.app),
          new InputScene(context, this.app),
          new LogicScene(context, this.app),
        ];
      }
    }

    this.start(!context?.editable && !options?.startPaused, options?.onLoaded);
  }

  private async start(
    startTicker?: boolean,
    onLoaded?: () => void
  ): Promise<void> {
    await Promise.all(this.scenes.map((scene) => scene.init()));

    this.scenes.forEach((scene) => {
      scene.start();
    });

    const gameLoop = (delta: number): void => {
      const deltaMS = delta * 1000;
      this._time += deltaMS;
      this.update(this._time, deltaMS);
    };
    this.app.ticker.add(gameLoop);

    if (this.sparkContext) {
      await this.sparkContext.start();
    }

    if (startTicker) {
      this.app.start();
    } else {
      this.app.ticker.update(performance.now());
      this.app.stop();
    }

    onLoaded?.();
  }

  destroy(removeView?: boolean, stageOptions?: boolean): void {
    this.resizeObserver.disconnect();
    if (this.sparkContext) {
      this.sparkContext.end();
    }
    if (this.app && this.app?.["cancelResize"]) {
      this.app.destroy(removeView, stageOptions);
    }
  }

  pause(): void {
    this.app.stop();
  }

  resume(): void {
    this.app.start();
  }

  update(time?: number, delta?: number): void {
    if (this.app) {
      this.scenes.forEach((scene) => {
        scene.update(time, delta);
      });
    }
  }
}

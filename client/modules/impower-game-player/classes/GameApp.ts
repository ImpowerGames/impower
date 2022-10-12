import * as PIXI from "pixi.js";
import { SparkContext } from "../../../../spark-engine";
import { registerPixiInspector } from "../utils/registerPixiInspector";
import { AudioScene } from "./AudioScene";
import { InputScene } from "./InputScene";
import { LogicScene } from "./LogicScene";
import { MainScene } from "./MainScene";
import { Scene } from "./Scene";
import { SVGLoader } from "./SVGLoader";

export const responsiveBreakpoints = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

export class GameApp {
  private _app: PIXI.Application;

  public get app(): PIXI.Application {
    return this._app;
  }

  private _loader: PIXI.Loader;

  public get loader(): PIXI.Loader {
    return this._loader;
  }

  private _svgLoader: SVGLoader;

  public get svgLoader(): SVGLoader {
    return this._svgLoader;
  }

  private _parent: HTMLElement;

  public get parent(): HTMLElement {
    return this._parent;
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

  constructor(domElementId: string, context?: SparkContext, paused?: boolean) {
    this._parent = document.getElementById(domElementId);

    this._app = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      autoStart: false,
      backgroundColor: 0x000000,
      resolution: window.devicePixelRatio,
      resizeTo: this._parent,
    });

    registerPixiInspector();

    this._loader = new PIXI.Loader();

    this._svgLoader = new SVGLoader();

    this._resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        this._app.resize();
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
        if (entry.target.parentElement.className !== className) {
          entry.target.parentElement.className = className;
        }
      }
    });
    this.resizeObserver.observe(this._parent);

    if (this._parent) {
      this._parent.appendChild(this._app.view);
    }

    this._sparkContext = context;
    if (this.sparkContext) {
      this.sparkContext.init();
    }

    if (context?.editable) {
      this._scenes = [
        new MainScene(this.sparkContext, this.app),
        new LogicScene(this.sparkContext, this.app),
      ];
    } else {
      this._scenes = [
        new MainScene(this.sparkContext, this.app),
        new AudioScene(this.sparkContext, this.app),
        new InputScene(this.sparkContext, this.app),
        new LogicScene(this.sparkContext, this.app),
      ];
    }

    this.start(!context?.editable && !paused);
  }

  private async start(startTicker?: boolean): Promise<void> {
    await Promise.all(this.scenes.map((scene) => scene.init()));

    this.scenes.forEach((scene) => {
      scene.start();
    });

    const loop = (delta: number): void => {
      this.update(this.app.ticker.deltaMS, delta);
    };
    this.app.ticker.add(loop);

    if (this.sparkContext) {
      await this.sparkContext.start();
    }

    if (startTicker) {
      this.app.start();
    } else {
      this.app.ticker.update(performance.now());
      this.app.stop();
    }
  }

  destroy(
    removeView?: boolean,
    stageOptions?: boolean | PIXI.IDestroyOptions
  ): void {
    this.resizeObserver.disconnect();
    if (this.sparkContext) {
      this.sparkContext.end();
    }
    if (this.loader) {
      this.loader.destroy();
    }
    if (this.app && this.app.cancelResize) {
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
    this.scenes.forEach((scene) => {
      scene.update(time, delta);
    });
  }
}

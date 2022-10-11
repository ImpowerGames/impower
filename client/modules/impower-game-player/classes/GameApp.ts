import * as PIXI from "pixi.js";
import {
  SparkContext,
  SparkGame,
  SparkGameRunner,
} from "../../../../spark-engine";
import { registerPixiInspector } from "../utils/registerPixiInspector";
import { MainScene } from "./MainScene";
import { Scene } from "./Scene";
import { SVGLoader } from "./SVGLoader";

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

  constructor(
    domElementId: string,
    sparkGame?: SparkGame,
    sparkRunner?: SparkGameRunner,
    control?: "Play" | "Pause"
  ) {
    const context = new SparkContext(sparkGame, sparkRunner);

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

    this._scenes = [
      new MainScene(this.sparkContext, this.app, this.loader, this.svgLoader),
    ];

    this.start(control);
  }

  private async start(control?: "Play" | "Pause"): Promise<void> {
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

    this.controlScenes(control);
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

  controlScenes(control?: "Play" | "Pause"): void {
    if (control === "Play") {
      this.app.start();
    }
    if (control === "Pause") {
      this.app.stop();
    }
  }

  update(time?: number, delta?: number): void {
    this.scenes.forEach((scene) => {
      scene.update(time, delta);
    });
  }
}

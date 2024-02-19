import { SparkContext } from "../../../../spark-engine/src";
import { Application, ApplicationOptions } from "../plugins/app";
import { SparkAssets } from "./SparkAssets";
import { SparkScene } from "./SparkScene";
import { MainScene } from "./scenes/MainScene";

export interface SparkGameAppOptions extends ApplicationOptions {
  initialScenes?: Record<string, SparkScene>;
}

export class SparkGameApp {
  private _parent: HTMLElement | null;

  public get parent(): HTMLElement | null {
    return this._parent;
  }

  private _app: Application;

  public get app(): Application {
    return this._app;
  }

  protected _assets: SparkAssets = new SparkAssets();

  public get assets(): SparkAssets {
    return this._assets;
  }

  private _context: SparkContext | undefined;

  public get context(): SparkContext | undefined {
    return this._context;
  }

  private _scenes: Map<string, SparkScene> = new Map();

  public get scenes(): Map<string, SparkScene> {
    return this._scenes;
  }

  private _resizeObserver: ResizeObserver;

  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  private _ready = false;

  constructor(
    domElementId: string,
    context?: SparkContext,
    options?: SparkGameAppOptions
  ) {
    this._parent = document.getElementById(domElementId);

    this._app = new Application({
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
    this._resizeObserver.observe(this._parent);
    if (this._parent) {
      const view = this.app.view as HTMLCanvasElement;
      this._parent.appendChild(view);
    }

    this._context = context;
    if (this.context) {
      this.context.init();
    }

    const startTicker = !context?.editable && !options?.startPaused;

    this.app.view.addEventListener("pointerdown", this.onPointerDown);
    this.app.view.addEventListener("pointerup", this.onPointerUp);
    this.app?.ticker?.add(this.onUpdate, this);
    try {
      if (startTicker) {
        this.app?.start();
      } else {
        this.app?.ticker?.update();
        this.app?.stop();
      }
    } catch {
      // App already stopped
    }

    const scenesToLoad =
      !context || context?.editable
        ? {}
        : options?.initialScenes ?? {
            main: new MainScene(context, this.app, this.assets),
            audio: new AudioScene(context, this.app, this.assets),
          };
    this.loadScenes(scenesToLoad).then(() => {
      this._ready = true;
      options?.onLoaded?.();
    });
  }

  async loadScenes(scenes: Record<string, SparkScene>): Promise<void> {
    const loadingUIName = "Loading";
    const loadingProgressVariable = "--loading_progress";
    this._scenes.clear();
    Object.entries(scenes).forEach(([id, scene]) => {
      this._scenes.set(id, scene);
    });
    if (this.context.game.module.ui) {
      this.context.game.module.ui.updateStyleProperty(
        loadingProgressVariable,
        0,
        loadingUIName
      );
    }
    if (this.context.game.module.ui) {
      this.context.game.module.ui.showUI(loadingUIName);
    }
    const allRequiredAssets: Record<string, { src: string; ext: string }> = {};
    this._scenes.forEach((scene) => {
      Object.entries(scene.getRequiredAssets()).forEach(([id, asset]) => {
        allRequiredAssets[id] = asset;
      });
    });
    await this.assets.loadAssets(allRequiredAssets, (p) => {
      if (this.context.game.module.ui) {
        this.context.game.module.ui.updateStyleProperty(
          loadingProgressVariable,
          p,
          loadingUIName
        );
      }
    });
    await Promise.all(
      Array.from(this.scenes).map(async ([, scene]): Promise<void> => {
        await scene.load();
      })
    );
    Array.from(this.scenes).map(async ([, scene]): Promise<void> => {
      if (this.app?.stage) {
        scene.init();
        this.app.stage.addChild(scene.root);
      }
    });
    if (this.context.game.module.ui) {
      this.context.game.module.ui.hideUI(loadingUIName);
    }
  }

  destroy(removeView?: boolean, stageOptions?: boolean): void {
    this.app.view.removeEventListener("pointerdown", this.onPointerDown);
    this.app.view.removeEventListener("pointerup", this.onPointerUp);
    this.scenes.forEach((scene) => {
      scene.unbind();
      scene.destroy();
    });
    this.resizeObserver.disconnect();
    if (this.context) {
      this.context.end();
    }
    if (this.app && this.app?.cancelResize) {
      this.app.destroy(removeView, stageOptions);
    }
  }

  onPointerDown = (event: PointerEvent): void => {
    this.context.game.module.input.pointerDown(event.button, "");
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.module.input.pointerUp(event.button, "");
  };

  pause(): void {
    if (this.app?.ticker) {
      this.app.ticker.speed = 0;
    }
    this.scenes.forEach((scene) => {
      if (scene?.active) {
        scene.pause();
      }
    });
  }

  unpause(): void {
    this.scenes.forEach((scene) => {
      if (scene?.active) {
        scene.unpause();
      }
    });
    if (this.app?.ticker) {
      this.app.ticker.speed = 1;
    }
  }

  protected _step(deltaMS: number): void {
    if (this.app) {
      if (deltaMS === 0) {
        this.app.dolly.allowControl = true;
      } else {
        this.app.dolly.allowControl = false;
      }
      if (this._ready) {
        this.scenes.forEach((scene) => {
          if (scene?.active) {
            if (scene.update(deltaMS)) {
              this.app.dolly.updateCamera();
            }
          }
        });
      }
    }
    if (this.context) {
      if (!this.context.update(deltaMS)) {
        this.destroy(true);
      }
    }
  }

  step(deltaMS: number): void {
    this.scenes.forEach((scene) => {
      if (scene?.active) {
        scene.step(deltaMS);
      }
    });
    this._step(deltaMS);
  }

  protected onUpdate(): void {
    const deltaMS = this.app.ticker?.deltaMS || 0;
    this._step(deltaMS);
  }
}

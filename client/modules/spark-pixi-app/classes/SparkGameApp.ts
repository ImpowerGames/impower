import { SparkContext } from "../../../../spark-engine";
import { Application, ApplicationOptions } from "../plugins/app";
import { MainScene } from "./scenes/MainScene";
import { SoundScene } from "./scenes/SoundScene";
import { SparkScene } from "./SparkScene";

export class SparkGameApp {
  private _parent: HTMLElement | null;

  public get parent(): HTMLElement | null {
    return this._parent;
  }

  private _app: Application;

  public get app(): Application {
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

  constructor(
    domElementId: string,
    context?: SparkContext,
    options?: ApplicationOptions
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

    if (context) {
      if (context?.editable) {
        this._scenes = [new MainScene(context, this.app)];
      } else {
        this._scenes = [
          new MainScene(context, this.app),
          new SoundScene(context, this.app),
        ];
      }
    }

    this.start(!context?.editable && !options?.startPaused, options?.onLoaded);
  }

  private async start(
    startTicker?: boolean,
    onLoaded?: () => void
  ): Promise<void> {
    this.app.view.addEventListener("pointerdown", this.onPointerDown);
    this.app.view.addEventListener("pointerup", this.onPointerUp);
    await Promise.all(this.scenes.map((scene) => scene.load()));
    this.scenes.forEach((scene) => {
      if (scene?.stage) {
        scene.init();
      }
    });
    this.scenes.forEach((scene) => {
      if (scene?.stage) {
        scene.bind();
      }
    });

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

    onLoaded?.();
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
    this.context.game.input.pointerDown(event.button, "");
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.input.pointerUp(event.button, "");
  };

  pause(): void {
    if (this.app?.ticker) {
      this.app.ticker.speed = 0;
    }
  }

  resume(): void {
    if (this.app?.ticker) {
      this.app.ticker.speed = 1;
    }
  }

  step(deltaMS: number): void {
    this.update(deltaMS);
  }

  protected update(deltaMS: number): void {
    if (this.app) {
      this.scenes.forEach((scene) => {
        if (deltaMS === 0) {
          this.app.dolly.allowControl = true;
        } else {
          this.app.dolly.allowControl = false;
          if (scene.update(deltaMS)) {
            this.app.dolly.updateCamera();
          }
        }
      });
    }
    if (this.context) {
      if (!this.context.update(deltaMS)) {
        this.destroy(true);
      }
    }
  }

  onUpdate(): void {
    const deltaMS = this.app.ticker?.deltaMS || 0;
    this.update(deltaMS);
  }
}

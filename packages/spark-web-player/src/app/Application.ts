import { SparkContext } from "../../../spark-engine/src";
import Scene from "./Scene";
import Ticker from "./Ticker";
import PerspectiveCamera from "./cameras/PerspectiveCamera";
import { OrbitControls } from "./controls/OrbitControls";
import Renderer from "./renderers/Renderer";
import MainScene from "./scenes/MainScene";
import SoundScene from "./scenes/SoundScene";

export default class Application {
  protected _context: SparkContext;
  public get context(): SparkContext {
    return this._context;
  }

  protected _ticker = new Ticker();
  get ticker() {
    return this._ticker;
  }

  protected _dom: HTMLElement | null;
  public get dom(): HTMLElement | null {
    return this._dom;
  }

  protected _screen: { width: number; height: number };
  get screen() {
    return this._screen;
  }

  protected _view: HTMLCanvasElement;
  get view() {
    return this._view;
  }

  protected _resizeObserver: ResizeObserver;
  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  protected _renderer = new Renderer({
    antialias: true,
  });
  get renderer() {
    return this._renderer;
  }

  protected _scenes = new Map<string, Scene>();
  public get scenes(): Map<string, Scene> {
    return this._scenes;
  }

  protected _camera: PerspectiveCamera;
  get camera() {
    return this._camera;
  }

  protected _orbit?: OrbitControls;
  get orbit() {
    return this._orbit;
  }

  protected _timeMS = 0;

  protected _ready = false;

  constructor(dom: HTMLElement, context: SparkContext) {
    this._dom = dom;

    const width = this._dom.clientWidth;
    const height = this._dom.clientHeight;
    this._screen = { width, height };
    this._view = this._renderer.domElement;

    this._camera = new PerspectiveCamera(50, width / height);
    this._camera.position.z = 1;

    this._renderer.setSize(width, height);

    this._resizeObserver = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize[0];
      if (borderBoxSize) {
        const width = borderBoxSize.inlineSize;
        const height = borderBoxSize.blockSize;
        this._screen = { width, height };
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
        this._renderer.setSize(width, height);
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this.scenes.forEach((scene) => {
          scene.resize();
        });
      }
    });
    this._resizeObserver.observe(this._dom);

    this._context = context;
    if (this.context) {
      this.context.init();
    }

    this.bindView();
    this._dom.appendChild(this._view);

    const startTicker = !context?.editable;

    this.ticker.add(this.onUpdate);
    if (startTicker) {
      this.ticker.start();
    }

    const scenesToLoad: Record<string, Scene> =
      !context || context?.editable
        ? {}
        : {
            main: new MainScene(context, this),
            sound: new SoundScene(context, this),
          };
    this.loadScenes(scenesToLoad).then(() => {
      this._ready = true;
    });
  }

  async loadScenes(scenes: Record<string, Scene>): Promise<void> {
    const loadingUIName = "LOADING";
    const loadingProgressVariable = "--LOADING_PROGRESS";
    this._scenes.clear();
    Object.entries(scenes).forEach(([id, scene]) => {
      this._scenes.set(id, scene);
    });
    if (this.context.game.ui) {
      this.context.game.ui.updateStyleProperty(
        loadingProgressVariable,
        0,
        loadingUIName
      );
    }
    if (this.context.game.ui) {
      this.context.game.ui.showUI(loadingUIName);
    }
    const allRequiredAssets: Record<string, { src: string; ext: string }> = {};
    this._scenes.forEach((scene) => {
      Object.entries(scene.getRequiredAssets()).forEach(([id, asset]) => {
        allRequiredAssets[id] = asset;
      });
    });
    // TODO:
    // await this.assets.loadAssets(allRequiredAssets, (p) => {
    //   if (this.context.game.ui) {
    //     this.context.game.ui.updateStyleProperty(
    //       loadingProgressVariable,
    //       p,
    //       loadingUIName
    //     );
    //   }
    // });
    await Promise.all(
      Array.from(this.scenes).map(async ([, scene]): Promise<void> => {
        await scene.load();
      })
    );
    Array.from(this.scenes).map(async ([, scene]): Promise<void> => {
      scene.init();
    });
    if (this.context.game.ui) {
      this.context.game.ui.hideUI(loadingUIName);
    }
  }

  bindView() {
    this._view.addEventListener("pointerdown", this.onPointerDown);
    this._view.addEventListener("pointerup", this.onPointerUp);
  }

  unbindView() {
    this.view.removeEventListener("pointerdown", this.onPointerDown);
    this.view.removeEventListener("pointerup", this.onPointerUp);
  }

  destroy(removeView?: boolean): void {
    this._ticker.dispose();
    this._renderer.dispose();
    this.unbindView();
    this.resizeObserver.disconnect();
    this.scenes.forEach((scene) => {
      scene.unbind();
      scene.destroy();
    });
    if (this.context) {
      this.context.end();
    }
    if (removeView) {
      this.view.remove();
    }
  }

  onPointerDown = (event: PointerEvent): void => {
    this.context.game.input.pointerDown(event.button, "");
  };

  onPointerUp = (event: PointerEvent): void => {
    this.context.game.input.pointerUp(event.button, "");
  };

  pause(): void {
    if (this.ticker) {
      this.ticker.speed = 0;
    }
    this.enableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.active) {
        scene.pause();
      }
    });
  }

  unpause(): void {
    this.disableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.active) {
        scene.unpause();
      }
    });
    if (this.ticker) {
      this.ticker.speed = 1;
    }
  }

  protected update(deltaMS: number): void {
    if (this._ready) {
      this.scenes.forEach((scene) => {
        if (scene?.active) {
          scene.tick(deltaMS);
          scene.update(deltaMS);
        }
      });
    }

    this._timeMS += deltaMS;

    if (this._orbit) {
      this._orbit.update();
    }

    const mainScene = this._scenes.get("main");
    if (mainScene) {
      this._renderer.render(mainScene, this._camera);
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
    this.update(deltaMS);
  }

  protected onUpdate = (deltaMS: number) => {
    this.update(deltaMS);
  };

  enableOrbitControls() {
    this._orbit = new OrbitControls(this._camera, this._view);
    this._orbit.saveState();
  }

  disableOrbitControls() {
    if (this._orbit) {
      this._orbit.reset();
      this._orbit.dispose();
      this._orbit = undefined;
    }
  }
}

import { Game } from "../../../spark-engine/src/game/core/classes/Game";
import Scene from "./Scene";
import Ticker from "./Ticker";
import PerspectiveCamera from "./render/cameras/PerspectiveCamera";
import OrbitControls from "./render/controls/OrbitControls";
import WebGLRenderer from "./render/renderers/WebGLRenderer";
import AudioScene from "./scenes/AudioScene";
import MainScene from "./scenes/MainScene";

export default class Application {
  protected _game: Game;
  public get game(): Game {
    return this._game;
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

  protected _view?: HTMLCanvasElement;
  get view() {
    return this._view;
  }

  protected _renderer?: WebGLRenderer;
  get renderer() {
    return this._renderer;
  }

  protected _resizeObserver: ResizeObserver;
  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
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

  constructor(dom: HTMLElement, game: Game) {
    this._dom = dom;
    const width = this._dom.clientWidth;
    const height = this._dom.clientHeight;
    try {
      this._renderer = new WebGLRenderer({
        antialias: true,
      });
      this._view = this._renderer.domElement;
      this._renderer.setSize(width, height);
    } catch (e) {
      console.error(e);
    }
    this._screen = { width, height };

    this._camera = new PerspectiveCamera(50, width / height);
    this._camera.position.z = 1;

    this._resizeObserver = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize[0];
      if (borderBoxSize) {
        const width = borderBoxSize.inlineSize;
        const height = borderBoxSize.blockSize;
        this._screen = { width, height };
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
        if (this._renderer) {
          this._renderer.setSize(width, height);
          this._renderer.setPixelRatio(window.devicePixelRatio);
        }
        this.scenes.forEach((scene) => {
          scene.resize();
        });
      }
    });
    this._resizeObserver.observe(this._dom);

    this._game = game;
    if (this.game) {
      this.game.start();
      this.bindUI();
    }

    if (this._view) {
      this._dom.appendChild(this._view);
      this.bindView();
    }

    this.ticker.add(this.onUpdate);
    this.ticker.start();

    const scenesToLoad: Record<string, Scene> = !game
      ? {}
      : {
          audio: new AudioScene(this),
          main: new MainScene(this),
        };
    this.loadScenes(scenesToLoad).then(() => {
      this._ready = true;
    });
  }

  async loadScenes(scenes: Record<string, Scene>): Promise<void> {
    const loadingUIName = "loading";
    const loadingProgressVariable = "--loading_progress";
    this._scenes.clear();
    Object.entries(scenes).forEach(([id, scene]) => {
      this._scenes.set(id, scene);
    });
    if (this.game.ui) {
      this.game.ui.style.update(loadingUIName, "", {
        [loadingProgressVariable]: "0",
      });
    }
    if (this.game.ui) {
      this.game.ui.showUI(loadingUIName);
    }
    const allRequiredAssets: Record<string, { src: string; ext: string }> = {};
    this._scenes.forEach((scene) => {
      Object.entries(scene.getRequiredAssets()).forEach(([id, asset]) => {
        allRequiredAssets[id] = asset;
      });
    });
    // TODO:
    // await this.assets.loadAssets(allRequiredAssets, (p) => {
    //   if (this.game.ui) {
    //     this.game.ui.updateStyleProperty(
    //       loadingProgressVariable,
    //       p,
    //       loadingUIName
    //     );
    //   }
    // });
    const scenesArray = Array.from(this.scenes.values());
    scenesArray.forEach((scene) => {
      scene.bind();
    });
    await Promise.all(
      scenesArray.map(async (scene): Promise<void> => {
        const objs = await scene.load();
        objs.forEach((obj) => scene.add(obj));
      })
    );
    scenesArray.forEach((scene) => {
      scene.start();
    });
    scenesArray.forEach((scene) => {
      scene.ready = true;
    });
    if (this.game.ui) {
      this.game.ui.hideUI(loadingUIName);
    }
  }

  bindUI() {
    this.game.ui.setOnPointerDown("", "", this.onPointerDownUI);
    this.game.ui.setOnPointerUp("", "", this.onPointerDownUI);
  }

  unbindUI() {
    this.game.ui.setOnPointerDown("", "", null);
    this.game.ui.setOnPointerUp("", "", null);
  }

  bindView() {
    if (this._view) {
      this._view.addEventListener("pointerdown", this.onPointerDownView);
      this._view.addEventListener("pointerup", this.onPointerUpView);
    }
  }

  unbindView() {
    if (this._view) {
      this._view.removeEventListener("pointerdown", this.onPointerDownView);
      this._view.removeEventListener("pointerup", this.onPointerUpView);
    }
  }

  destroy(removeView?: boolean): void {
    if (this._renderer) {
      this._renderer.dispose();
    }
    this._ticker.dispose();
    this.unbindView();
    this.unbindUI();
    this.resizeObserver.disconnect();
    this.scenes.forEach((scene) => {
      scene.ready = false;
      scene.unbind();
      scene.dispose().forEach((d) => d.dispose());
    });
    if (this.game) {
      this.game.destroy();
    }
    if (removeView && this.view) {
      this.view.remove();
    }
  }

  onPointerDownView = (event: PointerEvent): void => {
    this.game.input.pointerDown(event.button, "");
  };

  onPointerUpView = (event: PointerEvent): void => {
    this.game.input.pointerUp(event.button, "");
  };

  onPointerDownUI = (event: PointerEvent): void => {
    this.game.input.pointerDown(event.button, "");
  };

  onPointerUpUI = (event: PointerEvent): void => {
    this.game.input.pointerUp(event.button, "");
  };

  pause(): void {
    if (this.ticker) {
      this.ticker.speed = 0;
    }
    this.enableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.pause();
      }
    });
  }

  unpause(): void {
    this.disableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
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
        if (scene?.ready) {
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
      if (this._renderer) {
        this._renderer.render(mainScene, this._camera);
      }
    }

    if (this.game) {
      this.game.update(deltaMS);
    }
  }

  step(deltaMS: number): void {
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
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

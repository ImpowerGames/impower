import {
  Message,
  NotificationMessage,
  RequestMessage,
  ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import Scene from "./Scene";
import Ticker from "./Ticker";
import PerspectiveCamera from "./render/cameras/PerspectiveCamera";
import OrbitControls from "./render/controls/OrbitControls";
import WebGLRenderer from "./render/renderers/WebGLRenderer";
import AudioScene from "./scenes/AudioScene";
import MainScene from "./scenes/MainScene";
import UIScene from "./scenes/UIScene";
import { getEventData } from "./utils/getEventData";

export default class Application {
  // TODO: Application should only have a reference to gameWorker
  protected _game: Game;
  public get game(): Game {
    return this._game;
  }

  protected _ticker = new Ticker();
  get ticker() {
    return this._ticker;
  }

  protected _view: HTMLElement | null;
  public get view(): HTMLElement | null {
    return this._view;
  }

  protected _canvas?: HTMLCanvasElement;
  get canvas() {
    return this._canvas;
  }

  protected _overlay: HTMLElement | null;
  public get overlay(): HTMLElement | null {
    return this._overlay;
  }

  protected _screen: { width: number; height: number };
  get screen() {
    return this._screen;
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

  protected _camera?: PerspectiveCamera;
  get camera() {
    return this._camera;
  }

  protected _orbit?: OrbitControls;
  get orbit() {
    return this._orbit;
  }

  protected _audioContext?: AudioContext;
  get audioContext() {
    this.ensureAudioContext();
    return this._audioContext;
  }

  protected _connection: Connection;
  public get connection() {
    return this._connection;
  }

  protected _onCreateAudioContext?: (audioContext: AudioContext) => void;

  protected _timeMS = 0;

  constructor(
    game: Game,
    view: HTMLElement,
    overlay: HTMLElement,
    audioContext?: AudioContext,
    onCreateAudioContext?: (audioContext: AudioContext) => void
  ) {
    this._view = view;
    this._overlay = overlay;
    this._audioContext = audioContext;
    this._onCreateAudioContext = onCreateAudioContext;
    const width = this._view.clientWidth;
    const height = this._view.clientHeight;
    this._screen = { width, height };

    // TODO:
    // try {
    //   this._renderer = new WebGLRenderer({
    //     antialias: true,
    //   });
    //   this._canvas = this._renderer.domElement;
    //   this._renderer.setSize(width, height);
    // } catch (e) {
    //   console.error(e);
    // }
    // this._camera = new PerspectiveCamera(50, width / height);
    // this._camera.position.z = 1;

    this._resizeObserver = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize[0];
      if (borderBoxSize) {
        const width = borderBoxSize.inlineSize;
        const height = borderBoxSize.blockSize;
        this._screen = { width, height };
        if (this._camera) {
          this._camera.aspect = width / height;
          this._camera.updateProjectionMatrix();
        }
        if (this._renderer) {
          this._renderer.setSize(width, height);
          this._renderer.setPixelRatio(window.devicePixelRatio);
        }
        this.scenes.forEach((scene) => {
          scene.onResize(entry);
        });
      }
    });
    this._resizeObserver.observe(this._view);

    this._game = game;

    this._connection = new Connection({
      onSend: (msg, t) => this.emit(msg, t),
      onReceive: (msg) => this.onReceive(msg),
    });

    const scenesToLoad: Record<string, Scene> = {
      main: new MainScene(this),
      ui: new UIScene(this),
    };
    if (!game.context.system.previewing) {
      scenesToLoad["audio"] = new AudioScene(this);
    }
    this._scenes.clear();
    Object.entries(scenesToLoad).forEach(([id, scene]) => {
      this._scenes.set(id, scene);
    });

    if (this._canvas) {
      this._view.appendChild(this._canvas);
    }
    this.bind();
  }

  async init() {
    // TODO: application should bind to gameWorker.onmessage in order to receive messages emitted by worker
    await this._game.init({
      send: (msg: Message, _t?: ArrayBuffer[]) => {
        this.connection.receive(msg);
      },
      resolve: (path: string) => {
        // TODO: resolve import and load paths to url
        return path;
      },
      fetch: async (url: string): Promise<string> => {
        const response = await fetch(url);
        const text = await response.text();
        return text;
        // TODO: Differentiate between script text response and asset blob response
        // const buffer = await response.arrayBuffer();
        // return buffer;
      },
      log: (message: unknown, severity: "info" | "warning" | "error") => {
        if (severity === "error") {
          console.error(message);
        } else if (severity === "warning") {
          console.warn(message);
        } else {
          console.log(message);
        }
      },
      setTimeout: (
        handler: Function,
        timeout?: number,
        ...args: any[]
      ): number => {
        return setTimeout(handler, timeout, ...args);
      },
    });

    await this.loadScenes();
  }

  start() {
    this.ticker.add(this.onUpdate);
    this.ticker.start();
  }

  async loadScenes(): Promise<void> {
    const loadingUIName = "loading";
    const loadingProgressVariable = "--loading_progress";
    if (this.game.module.ui) {
      this.game.module.ui.style.update(loadingUIName, {
        [loadingProgressVariable]: "0",
      });
    }
    if (this.game.module.ui) {
      this.game.module.ui.showUI(loadingUIName);
    }
    const allRequiredAssets: Record<string, { src: string; ext: string }> = {};
    this._scenes.forEach((scene) => {
      Object.entries(scene.getRequiredAssets()).forEach(([id, asset]) => {
        allRequiredAssets[id] = asset;
      });
    });
    // TODO:
    // await this.assets.loadAssets(allRequiredAssets, (p) => {
    //   if (this.game.module.ui) {
    //     this.game.module.ui.updateStyleProperty(
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
        const objs = await scene.onLoad();
        objs.forEach((obj) => scene.add(obj));
      })
    );
    scenesArray.forEach((scene) => {
      scene.onStart();
    });
    scenesArray.forEach((scene) => {
      scene.ready = true;
    });
    if (this.game.module.ui) {
      this.game.module.ui.hideUI(loadingUIName);
    }
  }

  bind() {
    const view = this._canvas || this._view;
    if (view) {
      view.addEventListener("pointerdown", this.onPointerDownView);
      view.addEventListener("pointerup", this.onPointerUpView);
      view.addEventListener("click", this.onClickView);
    }
    if (this._overlay) {
      this._overlay.addEventListener("pointerdown", this.onPointerDownOverlay);
      this._overlay.addEventListener("pointerup", this.onPointerUpOverlay);
      this._overlay.addEventListener("click", this.onClickOverlay);
    }
  }

  unbind() {
    const view = this._canvas || this._view;
    if (view) {
      view.removeEventListener("pointerdown", this.onPointerDownView);
      view.removeEventListener("pointerup", this.onPointerUpView);
      view.removeEventListener("click", this.onClickView);
    }
    if (this._overlay) {
      this._overlay.removeEventListener(
        "pointerdown",
        this.onPointerDownOverlay
      );
      this._overlay.removeEventListener("pointerup", this.onPointerUpOverlay);
      this._overlay.removeEventListener("click", this.onClickOverlay);
    }
  }

  destroy(removeView?: boolean): void {
    if (this._renderer) {
      this._renderer.dispose();
    }
    this._ticker.dispose();
    this.unbind();
    this.resizeObserver.disconnect();
    this.scenes.forEach((scene) => {
      scene.ready = false;
      scene.unbind();
      scene.onDispose().forEach((d) => d.dispose());
    });
    if (this.game) {
      this.game.destroy();
    }
    if (removeView && this._canvas) {
      this._canvas.remove();
    }
  }

  emit(message: Message, _transfer?: ArrayBuffer[]) {
    // TODO: Call gameWorker.postMessage instead (worker should call game.connection.receive from self.onmessage)
    this.game.connection.receive(message);
  }

  ensureAudioContext() {
    if (!this._audioContext) {
      const audioContext = new AudioContext();
      if (audioContext.state === "running") {
        this._audioContext = audioContext;
        this._onCreateAudioContext?.(audioContext);
      }
    }
  }

  onPointerDownView = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpView = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onClickView = (event: MouseEvent): void => {
    this.ensureAudioContext();
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerDownOverlay = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpOverlay = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onClickOverlay = (event: MouseEvent): void => {
    this.ensureAudioContext();
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  pause(): void {
    this._overlay?.classList.add("pause-game");
    if (this.ticker) {
      this.ticker.speed = 0;
    }
    this.enableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onPause();
      }
    });
  }

  unpause(): void {
    this._overlay?.classList.remove("pause-game");
    this.disableOrbitControls();
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onUnpause();
      }
    });
    if (this.ticker) {
      this.ticker.speed = 1;
    }
  }

  protected update(deltaMS: number): void {
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onTick(deltaMS);
        scene.onUpdate(deltaMS);
      }
    });

    this._timeMS += deltaMS;

    if (this._orbit) {
      this._orbit.update();
    }

    const mainScene = this._scenes.get("main");
    if (mainScene) {
      if (this._renderer) {
        // TODO: this._renderer.render(mainScene, this._camera);
      }
    }

    if (this.game) {
      this.game.update(deltaMS);
    }
  }

  step(deltaMS: number): void {
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onStep(deltaMS);
      }
    });
    this.update(deltaMS);
  }

  protected onUpdate = (deltaMS: number) => {
    this.update(deltaMS);
  };

  enableOrbitControls() {
    if (this._camera && this._canvas) {
      this._orbit = new OrbitControls(this._camera, this._canvas);
      this._orbit.saveState();
    }
  }

  disableOrbitControls() {
    if (this._orbit) {
      this._orbit.reset();
      this._orbit.dispose();
      this._orbit = undefined;
    }
  }

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return new Promise((callback) => {
      this._scenes.forEach((scene) => {
        if ("id" in msg) {
          scene.onReceiveRequest(msg).then((response) => {
            if (response) {
              callback(response as any);
            }
          });
        } else {
          scene.onReceiveNotification(msg);
        }
      });
    });
  }
}

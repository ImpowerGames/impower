import {
  type Message,
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { Ticker } from "@impower/spark-engine/src/game/core/classes/Ticker";
import { Scene } from "./Scene";
import AudioScene from "./scenes/AudioScene";
import UIScene from "./scenes/UIScene";
import { getEventData } from "./utils/getEventData";
import INLINE_RENDERER_WORKER from "./workers/Renderer.worker";

const RENDERER_WORKER_URL = URL.createObjectURL(
  new Blob([INLINE_RENDERER_WORKER], {
    type: "text/javascript",
  })
);

export class Application {
  // TODO: Application should only have a reference to gameWorker
  protected _game: Game;
  public get game(): Game {
    return this._game;
  }

  protected _ticker = new Ticker(
    {
      get currentTime() {
        return performance.now();
      },
    },
    (callback: () => void) => window.requestAnimationFrame(callback)
  );
  get ticker() {
    return this._ticker;
  }

  protected _view: HTMLElement;
  public get view(): HTMLElement {
    return this._view;
  }

  protected _canvas: HTMLCanvasElement;
  get canvas() {
    return this._canvas;
  }

  protected _offscreenCanvas: OffscreenCanvas;

  protected _timeBuffer?: SharedArrayBuffer;

  protected _timeView?: Float64Array;

  protected _overlay: HTMLElement | null;
  public get overlay(): HTMLElement | null {
    return this._overlay;
  }

  protected _screen: { width: number; height: number };
  get screen() {
    return this._screen;
  }

  protected _resizeObserver: ResizeObserver;
  public get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  protected _scenes: Scene[] = [];
  public get scenes() {
    return this._scenes;
  }

  protected _audioContext?: AudioContext;
  get audioContext() {
    return this._audioContext;
  }

  protected _initialized = false;
  get initialized() {
    return this._initialized;
  }

  protected _rendererWorker: Worker;

  protected _rendererInitialized?: boolean;

  constructor(
    game: Game,
    view: HTMLElement,
    overlay: HTMLElement,
    audioContext?: AudioContext
  ) {
    this._view = view;
    this._overlay = overlay;
    this._canvas = document.createElement("canvas");
    this._view.appendChild(this._canvas);
    this._offscreenCanvas = this._canvas.transferControlToOffscreen();

    if (window.crossOriginIsolated) {
      this._timeBuffer = new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT);
      this._timeView = new Float64Array(this._timeBuffer);
    }

    this._audioContext = audioContext || new AudioContext();
    if (this._audioContext.state !== "running") {
      this._audioContext = undefined;
    } else {
      this._ticker.syncToClock(this._audioContext);
    }

    this._rendererWorker = new Worker(RENDERER_WORKER_URL);
    this._rendererWorker.onerror = (e) => {
      console.error(e);
    };

    this._resizeObserver = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize[0];
      if (borderBoxSize) {
        const width = borderBoxSize.inlineSize;
        const height = borderBoxSize.blockSize;
        this._screen = { width, height };
        if (this._rendererInitialized) {
          this.sendRendererRequest({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "renderer/resize",
            params: {
              width,
              height,
            },
          });
        }
        this.scenes.forEach((scene) => {
          scene.onResize(entry);
        });
      }
    });
    this._resizeObserver.observe(this._view);

    const width = this._view.clientWidth;
    const height = this._view.clientHeight;
    this._screen = { width, height };

    this._game = game;

    this.bind();
  }

  protected async sendRendererRequest<
    M extends { method: string; params: P },
    P extends object,
    R
  >(request: M, transfer: Transferable[] = []): Promise<R> {
    const id = "id" in request ? request.id : crypto.randomUUID();
    return new Promise<R>((resolve, reject) => {
      const onResponse = (e: MessageEvent) => {
        const message = e.data;
        if (message.method === request.method && message.id === id) {
          if (message.error !== undefined) {
            reject(message.error);
          } else {
            resolve(message.result);
          }
          this._rendererWorker.removeEventListener("message", onResponse);
        }
      };
      this._rendererWorker.addEventListener("message", onResponse);
      this._rendererWorker.postMessage(
        {
          jsonrpc: "2.0",
          id,
          ...request,
        },
        transfer
      );
    });
  }

  async init() {
    // Initialize screen
    const width = this._view.clientWidth;
    const height = this._view.clientHeight;
    this._screen = { width, height };

    // Initialize renderer
    await this.sendRendererRequest(
      {
        method: "renderer/initialize",
        params: {
          timeBuffer: this._timeBuffer,
          options: {
            view: this._offscreenCanvas,
            width,
            height,
            resolution: window.devicePixelRatio,
            antialias: true,
            autoDensity: true,
            backgroundAlpha: 0,
          },
        },
      },
      [this._offscreenCanvas]
    );
    this._rendererInitialized = true;

    // Initialize scenes
    const initialSceneConstructors = this.game.context.system.previewing
      ? [UIScene]
      : [UIScene, AudioScene];
    const scenes = await this.loadScenes(...initialSceneConstructors);
    scenes.forEach((scene) => this.startScene(scene));

    // Initialize game
    // TODO: application should bind to gameWorker.onmessage in order to receive messages emitted by worker
    this._game.init({
      send: (msg: Message, _t?: ArrayBuffer[]) => {
        this.onReceive(msg as RequestMessage | NotificationMessage);
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
    this._initialized = true;
  }

  setAudioContext(audioContext: AudioContext) {
    if (audioContext.state === "running") {
      this._audioContext = audioContext;
      this._ticker.syncToClock(audioContext);
    }
  }

  start() {
    this.ticker.add(this.onUpdate);
    this.ticker.start();
    this.sendRendererRequest({
      method: "renderer/start",
      params: {
        time: this._ticker.startTime,
      },
    });
  }

  async loadScenes(...sceneConstructors: (typeof Scene)[]): Promise<Scene[]> {
    // Load all scenes
    const scenes = sceneConstructors.map(
      (sceneConstructor) => new sceneConstructor(this)
    );
    // TODO: Load all scene assets
    // const loadingUIName = "loading";
    // const loadingProgressVariable = "--loading_progress";
    // this.game.module.ui.style.update(loadingUIName, {
    //   [loadingProgressVariable]: "0",
    // });
    // this.game.module.ui.showUI(loadingUIName);
    // const allRequiredAssets: Record<string, { src: string; ext: string }> = {};
    // scenes.forEach((scene) => {
    //   Object.entries(scene.getRequiredAssets()).forEach(([id, asset]) => {
    //     allRequiredAssets[id] = asset;
    //   });
    // });
    // await this.assets.loadAssets(allRequiredAssets, (p) => {
    //   if (this.game.module.ui) {
    //     this.game.module.ui.updateStyleProperty(
    //       loadingProgressVariable,
    //       p,
    //       loadingUIName
    //     );
    //   }
    // });
    await Promise.all(scenes.map((scene) => this.loadScene(scene)));
    // this.game.module.ui.hideUI(loadingUIName);
    return scenes;
  }

  async loadScene(scene: Scene) {
    // Bind scene so it can respond to dom events
    scene.bind();
    // Load scene
    await scene.onLoad();
    // Add to loaded scenes
    this._scenes.push(scene);
  }

  async startScene(scene: Scene) {
    scene.onStart();
    scene.ready = true;
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
    if (this._canvas) {
      this._canvas.removeEventListener("pointerdown", this.onPointerDownView);
      this._canvas.removeEventListener("pointerup", this.onPointerUpView);
      this._canvas.removeEventListener("click", this.onClickView);
    }
    if (this._view) {
      this._view.removeEventListener("pointerdown", this.onPointerDownView);
      this._view.removeEventListener("pointerup", this.onPointerUpView);
      this._view.removeEventListener("click", this.onClickView);
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
    if (this._rendererInitialized) {
      this.sendRendererRequest({
        method: "renderer/destroy",
        params: {},
      });
    }
    this._ticker.dispose();
    this.unbind();
    this.resizeObserver.disconnect();
    this.scenes.forEach((scene) => {
      scene.ready = false;
      scene.unbind();
      scene.onDispose();
    });
    if (this.game) {
      this.game.destroy();
    }
    if (removeView && this._canvas) {
      this._canvas.remove();
    }
  }

  send(message: Message, _transfer?: ArrayBuffer[]) {
    // TODO: Call gameWorker.postMessage instead (worker should call game.connection.receive from self.onmessage)
    this.game.connection.receive(message);
  }

  onPointerDownView = (event: PointerEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpView = (event: PointerEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  onClickView = (event: MouseEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  onPointerDownOverlay = (event: PointerEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpOverlay = (event: PointerEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  onClickOverlay = (event: MouseEvent): void => {
    this.send(EventMessage.type.notification(getEventData(event)));
  };

  pause(): void {
    this._overlay?.classList.add("pause-game");
    this.ticker.speed = 0;
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onPause();
      }
    });
  }

  unpause(): void {
    this._overlay?.classList.remove("pause-game");
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onUnpause();
      }
    });
    this.ticker.speed = 1;
  }

  protected update(time: Ticker): void {
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onUpdate();
      }
    });

    if (this._timeView) {
      this._timeView[0] = this._ticker.elapsedTime;
    } else {
      this.sendRendererRequest({
        method: "renderer/tick",
        params: {
          time: this._ticker.elapsedTime,
        },
      });
    }

    if (this.game) {
      this.game.update(time);
    }
  }

  step(seconds: number): void {
    this._ticker.adjustTime(seconds);
    this.scenes.forEach((scene) => {
      if (scene?.ready) {
        scene.onStep(seconds);
      }
    });
    this.update(this._ticker);
  }

  protected onUpdate = (time: Ticker) => {
    this.update(time);
  };

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return new Promise((resolve) => {
      this._scenes.forEach((scene) => {
        if ("id" in msg) {
          scene.onReceiveRequest(msg).then((response) => {
            if (response) {
              resolve(response as any);
            }
          });
        } else {
          scene.onReceiveNotification(msg);
        }
      });
    });
  }
}

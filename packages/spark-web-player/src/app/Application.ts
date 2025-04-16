import {
  type Message,
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { Ticker } from "@impower/spark-engine/src/game/core/classes/Ticker";
import { Container, Renderer, WebGLRenderer } from "pixi.js";
import "pixi.js/unsafe-eval";
import { Manager } from "./Manager";
import AudioManager from "./managers/AudioManager";
import EventManager from "./managers/EventManager";
import UIManager from "./managers/UIManager";
import { Scene } from "./Scene";
import { getEventData } from "./utils/getEventData";

export class Application {
  // TODO: Application should only have a reference to gameWorker
  protected _game: Game;
  get game(): Game {
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
  get view(): HTMLElement {
    return this._view;
  }

  protected _canvas: HTMLCanvasElement;
  get canvas() {
    return this._canvas;
  }

  _scenes: Scene[] = [];
  get scenes() {
    return this._scenes;
  }

  _renderer: Renderer;
  get renderer() {
    return this._renderer;
  }

  _stage: Container = new Container();
  get stage() {
    return this._stage;
  }

  protected _overlay: HTMLElement | null;
  get overlay(): HTMLElement | null {
    return this._overlay;
  }

  protected _screen: { width: number; height: number; resolution: number };
  get screen() {
    return this._screen;
  }

  protected _resizeObserver: ResizeObserver;
  get resizeObserver(): ResizeObserver {
    return this._resizeObserver;
  }

  protected _managers: Manager[] = [
    new UIManager(this),
    new AudioManager(this),
    new EventManager(this),
  ];
  get managers() {
    return this._managers;
  }

  protected _audioContext?: AudioContext;
  get audioContext() {
    return this._audioContext;
  }

  private _resolveInit!: () => void;

  private _initializing?: Promise<void>;
  get initializing() {
    if (this._initialized) {
      return Promise.resolve();
    }
    return this._initializing;
  }

  protected _initialized = false;
  get initialized() {
    return this._initialized;
  }

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
    this._renderer = new WebGLRenderer();

    const width = this._view.clientWidth;
    const height = this._view.clientHeight;
    this._screen = {
      width,
      height,
      resolution: window.devicePixelRatio,
    };

    this._audioContext = audioContext || new AudioContext();
    if (this._audioContext.state !== "running") {
      this._audioContext = undefined;
    } else {
      this._ticker.syncToClock(this._audioContext);
    }

    this._resizeObserver = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize[0];
      if (borderBoxSize) {
        const width = borderBoxSize.inlineSize;
        const height = borderBoxSize.blockSize;
        const resolution = this._screen.resolution;
        this._screen.width = width;
        this._screen.height = height;
        if (this._initialized) {
          if (this._renderer) {
            this._renderer.resize(width, height, resolution);
          }
        }
        for (const manager of this._managers) {
          manager.onResize(width, height, resolution);
        }
      }
    });
    this._resizeObserver.observe(this._view);

    this._game = game;

    this.bind();
  }

  async init() {
    this._initializing = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    // Initialize renderer
    await this._renderer.init({
      canvas: this._canvas,
      width: this._screen.width,
      height: this._screen.height,
      resolution: this._screen.resolution,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
    });

    // TODO: load main scene
    // await this.loadScene(SVGTestScene);

    // Initialize game
    // TODO: application should bind to gameWorker.onmessage in order to receive messages emitted by worker
    this._game.init({
      send: async (msg: Message, _t?: ArrayBuffer[]) => {
        const partialResponse = await this.onReceive(
          msg as RequestMessage | NotificationMessage
        );
        if (partialResponse && "id" in msg) {
          this.emit({
            jsonrpc: "2.0",
            id: msg.id,
            method: msg.method,
            ...partialResponse,
          });
        }
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
    this._resolveInit();
  }

  setAudioContext(audioContext: AudioContext) {
    if (audioContext.state === "running") {
      this._audioContext = audioContext;
      this._ticker.syncToClock(audioContext);
    }
  }

  async loadScene(sceneCtr: typeof Scene) {
    const scene = new sceneCtr(this);
    const children = await scene.onLoad();
    scene.bind();
    const sceneContainer = new Container();
    for (const child of children) {
      sceneContainer.addChild(child);
    }
    this._stage.addChild(sceneContainer);
    this._scenes.push(scene);
  }

  async loadScenes(sceneCtrs: (typeof Scene)[]) {
    await Promise.all(sceneCtrs.map((scene) => this.loadScene(scene)));
  }

  start() {
    for (const manager of this._managers) {
      manager.onStart();
    }
    for (const scene of this._scenes) {
      scene.onStart();
    }
    this.ticker.add((time) => this.update(time));
    this.ticker.start();
  }

  pause(): void {
    this._overlay?.classList.add("pause-game");
    this._ticker.speed = 0;
    for (const manager of this._managers) {
      manager.onPause();
    }
    for (const scene of this._scenes) {
      scene.onPause();
    }
  }

  unpause(): void {
    this._overlay?.classList.remove("pause-game");
    for (const manager of this._managers) {
      manager.onUnpause();
    }
    for (const scene of this._scenes) {
      scene.onUnpause();
    }
    this._ticker.speed = 1;
  }

  step(seconds: number): void {
    this._ticker.adjustTime(seconds);
    for (const manager of this._managers) {
      manager.onStep(seconds);
    }
    for (const scene of this._scenes) {
      scene.onStep(seconds);
    }
    this.update(this._ticker);
  }

  protected update(time: Ticker): void {
    if (this._game) {
      this._game.update(time);
    }
    for (const manager of this._managers) {
      manager.onUpdate();
    }
    for (const scene of this._scenes) {
      scene.onUpdate(time.elapsedTime);
    }
    if (this._renderer) {
      this._renderer.render(this._stage);
    }
  }

  destroy(removeCanvas?: boolean): void {
    if (this._renderer) {
      this._renderer.destroy();
    }
    this._ticker.dispose();
    this.unbind();
    this._resizeObserver.disconnect();
    for (const manager of this._managers) {
      manager.onDispose();
    }
    for (const scene of this._scenes) {
      scene.unbind();
      scene.onDispose();
    }
    if (this._game) {
      this._game.destroy();
    }
    if (removeCanvas && this._canvas) {
      this._canvas.remove();
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

  emit(message: Message, _transfer?: ArrayBuffer[]) {
    // TODO: Call gameWorker.postMessage instead (worker should call game.connection.receive from self.onmessage)
    this._game.connection.receive(message);
  }

  onPointerDownView = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpView = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onClickView = (event: MouseEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerDownOverlay = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onPointerUpOverlay = (event: PointerEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  onClickOverlay = (event: MouseEvent): void => {
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return new Promise((resolve) => {
      for (const manager of this._managers) {
        if ("id" in msg) {
          manager.onReceiveRequest(msg).then((response) => {
            if (response) {
              resolve(response as any);
            }
          });
        } else {
          manager.onReceiveNotification(msg);
        }
      }
    });
  }
}

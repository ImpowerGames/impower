import { Message } from "@impower/jsonrpc/src/types/Message";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseError } from "@impower/jsonrpc/src/types/ResponseError";
import {
  Container,
  DOMAdapter,
  extensions,
  ExtensionType,
  Loader,
  LoaderParser,
  LoaderParserPriority,
  Renderer,
  ResolvedAsset,
  WebGLRenderer,
} from "pixi.js";
import "pixi.js/unsafe-eval";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Game } from "../../../spark-engine/src/game/core/classes/Game";
import { EventMessage } from "../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { IApplication } from "./IApplication";
import { Manager } from "./Manager";
import AudioManager from "./managers/AudioManager";
import EventManager from "./managers/EventManager";
import UIManager from "./managers/UIManager";
import WorldManager from "./managers/WorldManager";
import { Camera } from "./plugins/projection/camera/camera";
import { CameraOrbitControl } from "./plugins/projection/camera/camera-orbit-control";
import { getEventData } from "./utils/getEventData";

export const loadBuffer: LoaderParser = {
  extension: {
    name: "loadBuffer",
    priority: LoaderParserPriority.Normal, // Actually will be last priority according to the console.log
    type: ExtensionType.LoadParser,
  },
  test(url: string, resolvedAsset?: ResolvedAsset, loader?: Loader) {
    return resolvedAsset?.loadParser === "loadBuffer";
  },
  async load(url: string, resolvedAsset?: ResolvedAsset, loader?: Loader) {
    const response = await DOMAdapter.get().fetch(url);
    const buffer = await response.arrayBuffer();
    return buffer;
  },
} as LoaderParser;
extensions.add(loadBuffer);

export class Application implements IApplication {
  protected _game: Game;
  get game() {
    return this._game;
  }

  get context() {
    return this._game.context;
  }

  protected _clock = new Clock(
    {
      get currentTime() {
        return performance.now();
      },
    },
    (callback: () => void) => window.requestAnimationFrame(callback)
  );
  get clock() {
    return this._clock;
  }

  protected _view: HTMLElement;
  get view(): HTMLElement {
    return this._view;
  }

  protected _canvas: HTMLCanvasElement;
  get canvas() {
    return this._canvas;
  }

  _renderer: Renderer;
  get renderer() {
    return this._renderer;
  }

  _stage: Container = new Container();
  get stage() {
    return this._stage;
  }

  protected _camera: Camera;
  get camera(): Camera {
    return this._camera;
  }

  protected _dolly: CameraOrbitControl;
  get dolly(): CameraOrbitControl {
    return this._dolly;
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

  protected _manager: {
    ui: UIManager;
    audio: AudioManager;
    world: WorldManager;
    event: EventManager;
  } = {
    ui: new UIManager(this),
    audio: new AudioManager(this),
    world: new WorldManager(this),
    event: new EventManager(this),
  };

  protected _managers: Manager[] = Object.values(this._manager);
  get managers() {
    return this._managers;
  }

  get ui() {
    return this._manager.ui;
  }

  get audio() {
    return this._manager.audio;
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

  protected _paused = false;
  get paused() {
    return this._paused;
  }

  protected _destroyed = false;
  get destroyed() {
    return this._destroyed;
  }

  constructor(
    game: Game,
    view: HTMLElement,
    overlay: HTMLElement,
    audioContext?: AudioContext
  ) {
    this._game = game;

    this._view = view;
    this._overlay = overlay;
    this._canvas = document.createElement("canvas");
    this._canvas.style.pointerEvents = "auto";
    this._view.appendChild(this._canvas);
    this._renderer = new WebGLRenderer();

    this._camera = new Camera(this._renderer);
    Camera.main = this._camera;
    this._dolly = new CameraOrbitControl(this._camera);
    this._dolly.allowControl = false;
    this._dolly.autoUpdate = false;

    const width = this._view.clientWidth;
    const height = this._view.clientHeight;
    this._screen = {
      width,
      height,
      resolution: window.devicePixelRatio,
    };

    if (!this._game.context.system.previewing) {
      this._audioContext = audioContext || new AudioContext();
      if (this._audioContext.state !== "running") {
        this._audioContext = undefined;
      } else {
        this._clock.syncToClock(this._audioContext);
      }
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
          try {
            if (this._renderer) {
              this._renderer.resize(width, height, resolution);
            }
          } catch {}
        }
        for (const manager of this._managers) {
          manager.onResize(width, height, resolution);
        }
      }
    });
    this._resizeObserver.observe(this._view);

    this.bind();
  }

  async init() {
    this._initializing = new Promise<void>((resolve) => {
      this._resolveInit = resolve;
    });

    if (!this._game.context.system.previewing) {
      // Don't initialize renderer in preview mode
      await this.initializeRenderer();
    }

    await this.initializeManagers();

    await this.connectGame();

    this._initialized = true;
    this._resolveInit();
  }

  async initializeRenderer() {
    await this._renderer.init({
      canvas: this._canvas,
      width: this._screen.width,
      height: this._screen.height,
      resolution: this._screen.resolution,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
    });
  }

  async connectGame() {
    // TODO: application should bind to gameWorker.onmessage in order to receive messages emitted by worker
    await this._game.connect(async (msg: Message, _t?: ArrayBuffer[]) => {
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
    });
  }

  async initializeManagers() {
    await Promise.all(this._managers.map((manager) => manager.onInit()));
  }

  setAudioContext(audioContext: AudioContext) {
    if (audioContext.state === "running") {
      this._audioContext = audioContext;
      this._clock.syncToClock(audioContext);
    }
  }

  start() {
    for (const manager of this._managers) {
      manager.onStart();
    }
    this.clock.add((time) => this.update(time));
    this.clock.start();
  }

  pause(): void {
    this._paused = true;
    this._overlay?.classList.add("pause-game");
    for (const manager of this._managers) {
      manager.onPause();
    }
    this._clock.speed = 0;
    this._dolly.allowControl = true;
    this._dolly.autoUpdate = true;
  }

  unpause(): void {
    this._paused = false;
    this._overlay?.classList.remove("pause-game");
    for (const manager of this._managers) {
      manager.onUnpause();
    }
    this._clock.speed = 1;
    this._dolly.allowControl = false;
    this._dolly.autoUpdate = false;
  }

  skip(seconds: number): void {
    this._clock.adjustTime(seconds);
    for (const manager of this._managers) {
      manager.onSkip(seconds);
    }
    this.update(this._clock);
  }

  protected update(time: Clock): void {
    if (!this._paused) {
      if (this._game) {
        this._game.update(time);
      }
      for (const manager of this._managers) {
        manager.onUpdate(time);
      }
    }
    if (this._renderer) {
      this._renderer.render(this._stage);
    }
  }

  destroy(removeCanvas?: boolean): void {
    try {
      this._destroyed = true;
      this._overlay?.classList.remove("pause-game");
      this._clock.dispose();
      this.unbind();
      this._resizeObserver.disconnect();
      for (const manager of this._managers) {
        manager.onDispose();
      }
      if (this._game) {
        this._game.destroy();
      }
      if (removeCanvas && this._canvas) {
        this._canvas.remove();
      }
      if (this._renderer) {
        this._renderer.destroy();
      }
    } catch (e) {
      console.error(e);
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

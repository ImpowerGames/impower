import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import {
  Container,
  DOMAdapter,
  extensions,
  ExtensionType,
  type LoaderParser,
  LoaderParserPriority,
  loadTextures,
  type Renderer,
  type ResolvedAsset,
  WebGLRenderer,
} from "pixi.js";
import "pixi.js/unsafe-eval";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Game } from "../../../spark-engine/src/game/core/classes/Game";
import { EventMessage } from "../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { AudioClockMessage } from "../../../spark-engine/src/game/modules/audio/classes/messages/AudioClockMessage";
import { AudioClock } from "./AudioClock";
import type { IApplication } from "./IApplication";
import { type AssetCache } from "./assets/AssetCache";
import { Manager } from "./Manager";
import { MessageRouter } from "./MessageRouter";
import AssetManager from "./managers/AssetManager";
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
  test(resolvedAsset?: ResolvedAsset) {
    return resolvedAsset?.loadParser === "loadBuffer";
  },
  async load(url: string) {
    const response = await DOMAdapter.get().fetch(url);
    const buffer = await response.arrayBuffer();
    return buffer;
  },
} as LoaderParser;
extensions.add(loadBuffer);

/**
 * Whether the event target is somewhere the player is typing, in which case
 * keys belong to that field rather than to the game.
 */
const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") {
    return false;
  }
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable
  );
};

export class Application implements IApplication {
  /** Reached only through `connect`, `connection.receive` and `update`:
   *  everything else between the page and the game is a message. */
  protected _game: Game;

  protected _previewing: boolean;

  protected _clock = new Clock(
    {
      get currentTime() {
        // Seconds, not milliseconds -- `ClockSource` is documented in
        // seconds and the frame budget is computed as `1 / maxFPS`, so
        // handing this `performance.now()` raw inflates every duration
        // 1000x until an AudioContext takes over as the time source.
        return performance.now() / 1000;
      },
    },
    (callback: () => void) => window.requestAnimationFrame(callback),
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
    assets: AssetManager;
  } = {
    ui: new UIManager(this),
    audio: new AudioManager(this),
    world: new WorldManager(this),
    event: new EventManager(this),
    assets: new AssetManager(this),
  };

  protected _assetCache?: AssetCache;
  get assetCache() {
    return this._assetCache;
  }

  protected _managers: Manager[] = Object.values(this._manager);
  get managers() {
    return this._managers;
  }

  protected _router = new MessageRouter(
    () => this._managers,
    (message, transfer) => this.emit(message, transfer),
  );

  get ui() {
    return this._manager.ui;
  }

  get audio() {
    return this._manager.audio;
  }

  get assets() {
    return this._manager.assets;
  }

  protected _audioContext?: AudioContext;
  get audioContext() {
    return this._audioContext;
  }

  /** Maps the shared clock onto the audio context and document timeline. */
  protected _audioClock = new AudioClock();
  get audioClock() {
    return this._audioClock;
  }

  /** The context whose state changes re-read the audio clock. */
  protected _watchedAudioContext?: AudioContext;

  /** When the audio clock was last read and sent to the game (page
   *  `performance.now()`), or undefined before the game is connected. */
  protected _audioClockSentAt?: number;

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
    options: {
      /** A preview shows the game without running it: no renderer, and no
       *  audio context of its own. */
      previewing: boolean;
      audioContext?: AudioContext;
      /** Shared by the host across the applications it builds, so STOP then
       *  PLAY does not re-fetch a scene. Without one, the asset manager makes
       *  its own. */
      assetCache?: AssetCache;
    },
  ) {
    this._game = game;
    this._previewing = options.previewing;
    const audioContext = options.audioContext;
    this._assetCache = options.assetCache;

    if (loadTextures.config) {
      // these workers don't work in iframe environments
      loadTextures.config.preferWorkers = false;
    }

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

    // Use the shared AudioContext the controller owns (passed in via
    // `audioContext`) — including in preview mode, so preview audio (character
    // voices, sfx) plays. We must NOT create a new context per Application in
    // preview: the Application is re-created on every edit, so minting one each
    // time would exhaust the browser's per-page context limit (the reason
    // preview mode used to skip this entirely). The controller creates a single
    // shared context once and reuses it; here we only adopt it. Outside preview
    // (e.g. the standalone player), fall back to creating one if none was passed.
    const sharedAudioContext =
      audioContext || (this._previewing ? undefined : new AudioContext());
    if (sharedAudioContext) {
      this._audioContext = sharedAudioContext;
      if (this._audioContext.state !== "running") {
        this._audioContext = undefined;
      } else {
        this._clock.syncToClock(this._audioContext);
      }
      this.watchAudioContext(sharedAudioContext);
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

    if (!this._previewing) {
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
    await this._game.connect((msg: Message, _t?: ArrayBuffer[]) => {
      this._router.receive(msg);
    });
    this.sendAudioClock();
  }

  /**
   * Reads the audio clock and tells the game. Sent at connect, whenever the
   * audio context starts, stops or resumes, and once a second while running,
   * so the reading follows any drift between the two clocks.
   */
  protected sendAudioClock() {
    this._audioClockSentAt = performance.now();
    this.emit(AudioClockMessage.type.notification(this._audioClock.read()));
  }

  protected watchAudioContext(audioContext: AudioContext) {
    if (this._watchedAudioContext === audioContext) {
      return;
    }
    this._watchedAudioContext?.removeEventListener(
      "statechange",
      this.onAudioStateChange,
    );
    this._watchedAudioContext = audioContext;
    audioContext.addEventListener("statechange", this.onAudioStateChange);
    this._audioClock.setContext(audioContext);
  }

  protected onAudioStateChange = (): void => {
    const audioContext = this._watchedAudioContext;
    if (audioContext?.state === "running") {
      this.setAudioContext(audioContext);
    }
    if (this._audioClockSentAt != null && !this._destroyed) {
      this.sendAudioClock();
    }
  };

  async initializeManagers() {
    await Promise.all(this._managers.map((manager) => manager.onInit()));
  }

  setAudioContext(audioContext: AudioContext) {
    this.watchAudioContext(audioContext);
    if (audioContext.state === "running") {
      if (this._audioContext === audioContext) {
        return;
      }
      this._audioContext = audioContext;
      this._clock.syncToClock(audioContext);
      if (this._audioClockSentAt != null) {
        this.sendAudioClock();
      }
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
    if (!this._destroyed) {
      if (
        this._audioClockSentAt != null &&
        performance.now() - this._audioClockSentAt >= 1000
      ) {
        this.sendAudioClock();
      }
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
  }

  async destroy(removeCanvas?: boolean) {
    try {
      this._destroyed = true;
      // Whatever the game still waits on from this page will not finish:
      // answer it now, so the game is not left waiting.
      this._router.disconnect();
      await this.initializing;
      this._overlay?.classList.remove("pause-game");
      this._clock.dispose();
      this._watchedAudioContext?.removeEventListener(
        "statechange",
        this.onAudioStateChange,
      );
      this.unbind();
      this._resizeObserver.disconnect();
      for (const manager of this._managers) {
        manager.onDispose();
      }
      if (this._renderer) {
        try {
          this._renderer.destroy();
        } catch {}
      }
      if (removeCanvas && this._canvas) {
        this._canvas.remove();
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
    // Keys don't target the canvas or the overlay (neither is focusable), so
    // they have to be picked up at the window level. The player is its own
    // frame, so this can't swallow keys meant for the surrounding editor.
    window.addEventListener("keydown", this.onKeyDown);
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
        this.onPointerDownOverlay,
      );
      this._overlay.removeEventListener("pointerup", this.onPointerUpOverlay);
      this._overlay.removeEventListener("click", this.onClickOverlay);
    }
    window.removeEventListener("keydown", this.onKeyDown);
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

  onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === " " && !isEditableTarget(event.target)) {
      // Otherwise space scrolls the player document out from under the game
      event.preventDefault();
    }
    this.emit(EventMessage.type.notification(getEventData(event)));
  };

}

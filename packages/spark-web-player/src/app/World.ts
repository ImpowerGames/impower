import { type ColorSource, Container } from "pixi.js";
import type { NotificationMessage } from "../../../jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "../../../jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "../../../jsonrpc/src/common/types/ResponseError";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";

import {
  attachInputEvents,
  createInputState,
  type InputState,
} from "./helpers/inputEvents";
import type { IApplication } from "./IApplication";
import {
  generateAnimatedSVGTextures,
  type GenerateAnimatedSVGTexturesOptions,
} from "./plugins/svg/utils/generateAnimatedSVGTextures";
import { parseSVG } from "./plugins/svg/utils/parseSVG";
import { generateSolidTexture } from "./plugins/texture/utils/generateSolidTexture";

/**
 * World manages the primary rendering stage, input event bindings,
 * camera control, and utility texture generation.
 *
 * It acts as the interface between the rendering engine (PixiJS)
 * and user interaction (pointers, drags, taps).
 */
export class World {
  private _inputState: InputState = createInputState();

  private _detachInputEvents?: () => void;

  private _onExit?: () => void;

  /**
   * The application.
   */
  get app() {
    return this._app;
  }
  private _app: IApplication;

  /**
   * Access the root display container (scene graph).
   */
  get stage(): Container {
    return this._stage;
  }
  private _stage: Container;

  /**
   * Whether the pointer is currently pressed down.
   */
  get pointerDown(): boolean {
    return this._pointerDown;
  }
  private _pointerDown = false;

  /**
   * X position where the pointer was pressed.
   */
  get pointerDownX(): number {
    return this._pointerDownX;
  }
  private _pointerDownX = 0;

  /**
   * Y position where the pointer was pressed.
   */
  get pointerDownY(): number {
    return this._pointerDownY;
  }
  private _pointerDownY = 0;

  /**
   * Whether a dragging gesture is currently active.
   */
  get pointerDragging(): boolean {
    return this._pointerDragging;
  }
  private _pointerDragging = false;

  /**
   * Minimum drag distance to start mouse drag gesture.
   */
  get mouseDragThreshold(): number {
    return this._mouseDragThreshold;
  }
  set mouseDragThreshold(value: number) {
    this._mouseDragThreshold = value;
  }
  private _mouseDragThreshold = 1;

  /**
   * Minimum drag distance to start pen drag gesture.
   */
  get penDragThreshold(): number {
    return this._penDragThreshold;
  }
  set penDragThreshold(value: number) {
    this._penDragThreshold = value;
  }
  private _penDragThreshold = 2;

  /**
   * Minimum drag distance to start touch drag gesture.
   */
  get touchDragThreshold(): number {
    return this._touchDragThreshold;
  }
  set touchDragThreshold(value: number) {
    this._touchDragThreshold = value;
  }
  private _touchDragThreshold = 4;

  /**
   * Create a World instance.
   * @param app The IApplication implementation.
   * @param onExit Optional callback to run on exit.
   */
  constructor(app: IApplication, onExit?: () => void) {
    this._app = app;
    this.bind(); // Hook up input listeners
    this._onExit = onExit;
    this._stage = new Container();
    this._stage.sortableChildren = true; // Ensure children are drawn in z-index order
  }

  /**
   * Call this to exit this world and resume normal game flow.
   */
  exit() {
    this.unbind();
    this.onDisconnected();
    this._onExit?.();
  }

  /**
   * Add event listeners for pointer input.
   */
  private bind(): void {
    this._detachInputEvents = attachInputEvents(
      this._app.canvas,
      this._inputState,
      {
        onDown: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerDown(e);
          }
        },
        onMove: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerMove(e);
          }
        },
        onUp: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onPointerUp(e);
          }
        },
        onTap: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onTap(e);
          }
        },
        onDragStart: (e: PointerEvent, t: number, dx: number, dy: number) => {
          if (this._app.clock.speed > 0) {
            this.onDragStart(e, t, dx, dy);
          }
        },
        onDrag: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onDrag(e);
          }
        },
        onDragEnd: (e: PointerEvent) => {
          if (this._app.clock.speed > 0) {
            this.onDragEnd(e);
          }
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyDown(e);
          }
        },
        onKeyUp: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyUp(e);
          }
        },
        onKeyPress: (e: KeyboardEvent) => {
          if (this._app.clock.speed > 0) {
            this.onKeyPress(e);
          }
        },
      },
    );
  }

  /**
   * Remove event listeners.
   */
  private unbind(): void {
    this._detachInputEvents?.();
  }

  /**
   * Called once during loading phase.
   * Override to preload assets or initialize state.
   */
  async onLoad(): Promise<void> {}

  /**
   * Called once after the world has finished loading and is ready to start running.
   * Override to register event listeners and other hooks.
   */
  onConnected(): void {}

  /**
   * Called once before the world is unloaded.
   * Override to unregister event listeners and other hooks.
   */
  onDisconnected(): void {}

  /**
   * Called once when the world starts running.
   * Override to begin animations, music, or systems.
   */
  onStart(): void {}

  /**
   * Called on every animation frame while the world is active.
   * @param _time The game clock object.
   */
  onUpdate(_time: Clock): void {}

  /**
   * Called when the world is skipped ahead.
   * @param _seconds Number of seconds to skip.
   */
  onSkip(_seconds: number): void {}

  /**
   * Called when the world is paused.
   */
  onPause(): void {}

  /**
   * Called when the world is unpaused.
   */
  onUnpause(): void {}

  /**
   * Called when the screen size or resolution changes.
   * @param width New width
   * @param height New height
   * @param resolution Device pixel ratio
   */
  onResize(): void {}

  /**
   * Triggered when pointer goes down.
   * @param _event PointerEvent from browser
   */
  protected onPointerDown(_event: PointerEvent): void {}

  /**
   * Triggered when pointer moves.
   * @param _event PointerEvent from browser
   */
  protected onPointerMove(_event: PointerEvent): void {}

  /**
   * Triggered when pointer is released.
   * @param _event PointerEvent from browser
   */
  protected onPointerUp(_event: PointerEvent): void {}

  /**
   * Triggered on tap (click without drag).
   * @param _event PointerEvent from browser
   */
  protected onTap(_event: PointerEvent): void {}

  /**
   * Triggered on start of a drag gesture.
   * @param _event PointerEvent
   * @param _dragThreshold Drag threshold used
   * @param _distanceX Horizontal drag distance
   * @param _distanceY Vertical drag distance
   */
  protected onDragStart(
    _event: PointerEvent,
    _dragThreshold: number,
    _distanceX: number,
    _distanceY: number,
  ): void {}

  /**
   * Triggered on drag update.
   * @param _event PointerEvent from browser
   */
  protected onDrag(_event: PointerEvent): void {}

  /**
   * Triggered when a drag ends.
   * @param _event PointerEvent from browser
   */
  protected onDragEnd(_event: PointerEvent): void {}

  /**
   * Triggered when a key is pressed down.
   * @param _event KeyboardEvent from browser
   */
  protected onKeyDown(_event: KeyboardEvent): void {}

  /**
   * Triggered when a key is released.
   * @param _event KeyboardEvent from browser
   */
  protected onKeyUp(_event: KeyboardEvent): void {}

  /**
   * Triggered when a key is pressed down and then released.
   * @param _event KeyboardEvent from browser
   */
  protected onKeyPress(_event: KeyboardEvent): void {}

  /**
   * Handle a notification from the engine.
   * @param msg The notification message
   */
  public receiveNotification(msg: NotificationMessage): void {
    this.onReceiveNotification(msg);
  }

  /**
   * Triggered when a notification message is received.
   * @param _msg The notification message
   */
  protected onReceiveNotification(_msg: NotificationMessage): void {}

  /**
   * Handle a request from the engine.
   * @param msg The request message
   * @returns Optionally a response with result or error
   */
  public async receiveRequest(
    msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return this.onReceiveRequest(msg);
  }

  /**
   * Triggered when a request message is received.
   * @param _msg The request message
   * @returns Optionally a response with result or error
   */
  protected async onReceiveRequest(
    _msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  /**
   * Generate a simple solid-colored texture using the current renderer.
   * @param width Width in pixels
   * @param height Height in pixels
   * @param color Optional color (defaults to white)
   * @returns A texture with a solid color
   */
  generateSolidTexture(width: number, height: number, color?: ColorSource) {
    return generateSolidTexture(this._app.renderer, width, height, color);
  }

  /**
   * Generate textures from an SVG string (supports SMIL animation).
   * @param svg SVG markup string
   * @param options Optional generation settings
   * @returns An array of textures that can be passed to an `AnimatedSprite` or `AnimatedSprite3D`
   */
  generateSvgTextures(
    svg: string,
    options?: GenerateAnimatedSVGTexturesOptions,
  ) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTextures(this._app.renderer, svgEl, options);
  }
}

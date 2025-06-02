import { ColorSource, Container } from "pixi.js";
import { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { NotificationMessage } from "../../../spark-engine/src/game/core/types/NotificationMessage";
import { RequestMessage } from "../../../spark-engine/src/game/core/types/RequestMessage";
import { ResponseError } from "../../../spark-engine/src/game/core/types/ResponseError";

import {
  attachPointerEvents,
  createPointerState,
  PointerState,
} from "./helpers/pointerEvents";
import { IApplication } from "./IApplication";
import {
  generateAnimatedSVGTextures,
  GenerateAnimatedSVGTexturesOptions,
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
  protected _app: IApplication;

  private _pointerState: PointerState = createPointerState();

  private _detachPointerEvents?: () => void;

  private _onExit?: () => void;

  /**
   * Access the game's context.
   */
  get context() {
    return this._app.context;
  }

  /**
   * Access the rendering screen info.
   */
  get screen() {
    return this._app.screen;
  }

  /**
   * Access the canvas element used for rendering.
   */
  get canvas() {
    return this._app.canvas;
  }

  /**
   * Access the PixiJS renderer.
   */
  get renderer() {
    return this._app.renderer;
  }

  /**
   * Access the orbit control used for manipulating the camera (e.g. drag-to-rotate).
   */
  public get dolly() {
    return this._app.dolly;
  }

  /**
   * Access the main projection camera.
   */
  public get camera() {
    return this._app.camera;
  }

  /**
   * Get or set the background color of the renderer.
   */
  get backgroundColor() {
    return this._app.renderer.background.color;
  }
  set backgroundColor(value: ColorSource) {
    this._app.renderer.background.color = value;
  }

  /**
   * Access the root display container (scene graph).
   */
  public get stage(): Container {
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
    this._detachPointerEvents = attachPointerEvents(
      this.canvas,
      this._pointerState,
      {
        onDown: (e) => {
          if (this._app.clock.speed > 0) {
            this.onPointerDown(e);
          }
        },
        onMove: (e) => {
          if (this._app.clock.speed > 0) {
            this.onPointerMove(e);
          }
        },
        onUp: (e) => {
          if (this._app.clock.speed > 0) {
            this.onPointerUp(e);
          }
        },
        onTap: (e) => {
          if (this._app.clock.speed > 0) {
            this.onTap(e);
          }
        },
        onDragStart: (e, t, dx, dy) => {
          if (this._app.clock.speed > 0) {
            this.onDragStart(e, t, dx, dy);
          }
        },
        onDrag: (e) => {
          if (this._app.clock.speed > 0) {
            this.onDrag(e);
          }
        },
        onDragEnd: (e) => {
          if (this._app.clock.speed > 0) {
            this.onDragEnd(e);
          }
        },
      }
    );
  }

  /**
   * Remove event listeners.
   */
  private unbind(): void {
    this._detachPointerEvents?.();
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
   * @param time The game clock object.
   */
  onUpdate(time: Clock): void {}

  /**
   * Called when the world is skipped ahead.
   * @param seconds Number of seconds to skip.
   */
  onSkip(seconds: number): void {}

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
  onResize(width: number, height: number, resolution: number): void {}

  /**
   * Triggered when pointer goes down.
   * @param event PointerEvent from browser
   */
  protected onPointerDown(event: PointerEvent): void {}

  /**
   * Triggered when pointer moves.
   * @param event PointerEvent from browser
   */
  protected onPointerMove(event: PointerEvent): void {}

  /**
   * Triggered when pointer is released.
   * @param event PointerEvent from browser
   */
  protected onPointerUp(event: PointerEvent): void {}

  /**
   * Triggered on tap (click without drag).
   * @param event PointerEvent from browser
   */
  protected onTap(event: PointerEvent): void {}

  /**
   * Triggered on start of a drag gesture.
   * @param event PointerEvent
   * @param dragThreshold Drag threshold used
   * @param distanceX Horizontal drag distance
   * @param distanceY Vertical drag distance
   */
  protected onDragStart(
    event: PointerEvent,
    dragThreshold: number,
    distanceX: number,
    distanceY: number
  ): void {}

  /**
   * Triggered on drag update.
   * @param event PointerEvent from browser
   */
  protected onDrag(event: PointerEvent): void {}

  /**
   * Triggered when a drag ends.
   * @param event PointerEvent from browser
   */
  protected onDragEnd(event: PointerEvent): void {}

  /**
   * Handle a notification from the engine.
   * @param msg The notification message
   */
  public receiveNotification(msg: NotificationMessage): void {
    this.onReceiveNotification(msg);
  }

  /**
   * Triggered when a notification message is received.
   * @param msg The notification message
   */
  protected onReceiveNotification(msg: NotificationMessage): void {}

  /**
   * Handle a request from the engine.
   * @param msg The request message
   * @returns Optionally a response with result or error
   */
  public async receiveRequest(
    msg: RequestMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return this.onReceiveRequest(msg);
  }

  /**
   * Triggered when a request message is received.
   * @param msg The request message
   * @returns Optionally a response with result or error
   */
  protected async onReceiveRequest(
    msg: RequestMessage
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
    return generateSolidTexture(this.renderer, width, height, color);
  }

  /**
   * Generate textures from an SVG string (supports SMIL animation).
   * @param svg SVG markup string
   * @param options Optional generation settings
   * @returns An array of textures that can be passed to an `AnimatedSprite` or `AnimatedSprite3D`
   */
  generateSvgTextures(
    svg: string,
    options?: GenerateAnimatedSVGTexturesOptions
  ) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTextures(this.renderer, svgEl, options);
  }
}

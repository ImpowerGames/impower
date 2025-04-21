import { Clock } from "@impower/spark-engine/src/game/core/classes/Clock";
import { NotificationMessage } from "@impower/spark-engine/src/game/core/types/NotificationMessage";
import { RequestMessage } from "@impower/spark-engine/src/game/core/types/RequestMessage";
import { ResponseError } from "@impower/spark-engine/src/game/core/types/ResponseError";
import { ColorSource, Container } from "pixi.js";

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

  private _stage: Container;
  /**
   * Access the root display container (scene graph).
   */
  public get stage(): Container {
    return this._stage;
  }

  // Pointer tracking for interaction state
  private _pointerDown = false;
  get pointerDown(): boolean {
    return this._pointerDown;
  }

  private _pointerDownX = 0;
  get pointerDownX(): number {
    return this._pointerDownX;
  }

  private _pointerDownY = 0;
  get pointerDownY(): number {
    return this._pointerDownY;
  }

  private _pointerDragging = false;
  get pointerDragging(): boolean {
    return this._pointerDragging;
  }

  // Thresholds for recognizing drag gestures, depending on pointer type
  private _mouseDragThreshold = 1;
  get mouseDragThreshold(): number {
    return this._mouseDragThreshold;
  }
  set mouseDragThreshold(value: number) {
    this._mouseDragThreshold = value;
  }

  private _penDragThreshold = 2;
  get penDragThreshold(): number {
    return this._penDragThreshold;
  }
  set penDragThreshold(value: number) {
    this._penDragThreshold = value;
  }

  private _touchDragThreshold = 4;
  get touchDragThreshold(): number {
    return this._touchDragThreshold;
  }
  set touchDragThreshold(value: number) {
    this._touchDragThreshold = value;
  }

  private _onExit?: () => void;

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
    this.onDispose();
    this._onExit?.();
  }

  /**
   * Add event listeners for pointer input.
   */
  private bind(): void {
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
    }
    window.addEventListener("mouseup", this.handlePointerUp);
    window.addEventListener("touchend", this.handleTouchEnd);
  }

  /**
   * Remove event listeners.
   */
  private unbind(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    }
    window.removeEventListener("mouseup", this.handlePointerUp);
    window.removeEventListener("touchend", this.handleTouchEnd);
  }

  /**
   * Handle pointer down event and record coordinates.
   */
  private handlePointerDown = (event: PointerEvent): void => {
    this.onPointerDown(event);
    this._pointerDown = true;
    this._pointerDragging = false;
    this._pointerDownX = event.offsetX;
    this._pointerDownY = event.offsetY;
  };

  /**
   * Handle pointer movement and determine drag behavior.
   */
  private handlePointerMove = (event: PointerEvent): void => {
    if (this._app.clock.speed > 0) {
      this.onPointerMove(event);
      if (this._pointerDown) {
        const pointerX = event.offsetX;
        const pointerY = event.offsetY;
        const dragDistanceX = pointerX - this._pointerDownX;
        const dragDistanceY = pointerY - this._pointerDownY;
        const dragDistance = dragDistanceX ** 2 + dragDistanceY ** 2;
        const dragThreshold =
          event.pointerType === "mouse"
            ? this.mouseDragThreshold
            : event.pointerType === "pen"
            ? this.penDragThreshold
            : this.touchDragThreshold;
        if (Math.abs(dragDistance) > dragThreshold) {
          if (!this._pointerDragging) {
            this._pointerDragging = true;
            this.onDragStart(
              event,
              dragThreshold,
              dragDistanceX,
              dragDistanceY
            );
          }
          this.onDrag(event);
        }
      }
    }
  };

  /**
   * Handle mouse button release (may trigger tap or end drag).
   */
  private handlePointerUp = (event: MouseEvent): void => {
    const pointerEvent = event as PointerEvent;
    this.onPointerUp(pointerEvent);
    if (this._pointerDown) {
      if (this._pointerDragging) {
        this.onDragEnd(pointerEvent);
      } else {
        this.onTap(pointerEvent);
      }
    }
    this._pointerDown = false;
    this._pointerDragging = false;
  };

  /**
   * Normalize touch end into a pointer event for consistency.
   */
  private handleTouchEnd = (event: TouchEvent): void => {
    if (event?.touches?.length === 0) {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const touch = event?.targetTouches?.[0];
      const offsetX = touch?.clientX ?? 0 - rect.x;
      const offsetY = touch?.clientY ?? 0 - rect.y;
      const pointerEvent = {
        ...event,
        ...(touch || {}),
        offsetX,
        offsetY,
      } as unknown as PointerEvent;
      this.handlePointerUp(pointerEvent);
    }
  };

  // Lifecycle hooks to be optionally overridden in subclasses:

  async onLoad(): Promise<void> {}

  onStart(): void {}

  onUpdate(_time: Clock): void {}

  onSkip(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(_width: number, _height: number, _resolution: number): void {}

  protected onDispose() {}

  // Input interaction callbacks:

  protected onPointerDown(_event: PointerEvent): void {}

  protected onPointerMove(_event: PointerEvent): void {}

  protected onPointerUp(_event: PointerEvent): void {}

  protected onTap(_event: PointerEvent): void {}

  protected onDragStart(
    _event: PointerEvent,
    _dragThreshold: number,
    _distanceX: number,
    _distanceY: number
  ): void {}

  protected onDrag(_event: PointerEvent): void {}

  protected onDragEnd(_event: PointerEvent): void {}

  // Messaging hooks:

  protected onReceiveNotification(_msg: NotificationMessage): void {}

  protected async onReceiveRequest(
    _msg: RequestMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  /**
   * Generate a simple solid-colored texture using the current renderer.
   */
  generateSolidTexture(width: number, height: number, color?: number) {
    return generateSolidTexture(this.renderer, width, height, color);
  }

  /**
   * Generate textures from an SVG string (supports SMIL animation).
   */
  generateSvgTextures(
    svg: string,
    options?: GenerateAnimatedSVGTexturesOptions
  ) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTextures(this.renderer, svgEl, options);
  }
}

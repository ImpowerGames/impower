import { SparkContext } from "../../../../spark-engine";
import { Application } from "../plugins/app";
import { Rectangle, Renderer } from "../plugins/core";
import { CameraOrbitControl, Container3D } from "../plugins/projection";
import { Ticker } from "../plugins/ticker";
import { SparkAssets } from "./SparkAssets";

export class SparkScene {
  private _active = true;

  public get active(): boolean {
    return this._active;
  }

  public set active(value: boolean) {
    this._active = value;
  }

  private _context: SparkContext;

  public get context(): SparkContext {
    return this._context;
  }

  private _app: Application;

  public get screen(): Rectangle {
    return this._app.screen as Rectangle;
  }

  public get view(): HTMLCanvasElement {
    return this._app.view as HTMLCanvasElement;
  }

  public get renderer(): Renderer {
    return this._app.renderer as Renderer;
  }

  private _assets: SparkAssets;

  public get assets(): SparkAssets {
    return this._assets;
  }

  public get maxFPS(): number {
    return this._app.ticker?.maxFPS;
  }

  public get ticker(): Ticker {
    return this._app.ticker;
  }

  public get stage(): Container3D {
    return this._app.stage as Container3D;
  }

  public get dolly(): CameraOrbitControl {
    return this._app.dolly;
  }

  protected _pointerDown = false;

  public get pointerDown(): boolean {
    return this._pointerDown;
  }

  protected _pointerDownX = 0;

  public get pointerDownX(): number {
    return this._pointerDownX;
  }

  protected _pointerDownY = 0;

  public get pointerDownY(): number {
    return this._pointerDownY;
  }

  protected _dragging = false;

  public get dragging(): boolean {
    return this._dragging;
  }

  protected _mouseDragThreshold = 1;

  public get mouseDragThreshold(): number {
    return this._mouseDragThreshold;
  }

  public set mouseDragThreshold(value: number) {
    this._mouseDragThreshold = value;
  }

  protected _penDragThreshold = 2;

  public get penDragThreshold(): number {
    return this._penDragThreshold;
  }

  public set penDragThreshold(value: number) {
    this._penDragThreshold = value;
  }

  protected _touchDragThreshold = 4;

  public get touchDragThreshold(): number {
    return this._touchDragThreshold;
  }

  public set touchDragThreshold(value: number) {
    this._touchDragThreshold = value;
  }

  protected _container = new Container3D();

  public get root(): Container3D {
    return this._container;
  }

  constructor(context: SparkContext, app: Application, assets: SparkAssets) {
    this._context = context;
    this._app = app;
    this._assets = assets;
    this.bind();
  }

  getRequiredAssets(): Record<string, { src: string; ext: string }> {
    return {};
  }

  async load(): Promise<void> {
    // NoOp
  }

  init(): void {
    // NoOp
  }

  update(_deltaMS?: number): boolean {
    // NoOp
    return false;
  }

  step(_deltaMS?: number): void {
    // NoOp
  }

  pause(): void {
    // NoOp
  }

  unpause(): void {
    // NoOp
  }

  resize(): void {
    // NoOp
  }

  reset(): void {
    // NoOp
  }

  destroy(): void {
    // NoOp
  }

  _onPointerDown = (event: PointerEvent): void => {
    this.onPointerDown(event);
    this._pointerDown = true;
    this._dragging = false;
    this._pointerDownX = event.offsetX;
    this._pointerDownY = event.offsetY;
  };

  _onPointerMove = (event: PointerEvent): void => {
    if (this._app.ticker.speed > 0) {
      this.onPointerMove(event);
      if (this._pointerDown) {
        const pointerX = event.offsetX;
        const pointerY = event.offsetY;
        const dragDistanceX = pointerX - this._pointerDownX;
        const dragDistanceY = pointerY - this._pointerDownY;
        const dragDistance = dragDistanceX ** 2 + dragDistanceY ** 2;
        const dragThreshold =
          event.pointerType === "mouse"
            ? this._mouseDragThreshold
            : event.pointerType === "pen"
            ? this._penDragThreshold
            : this._touchDragThreshold;
        if (Math.abs(dragDistance) > dragThreshold) {
          if (!this._dragging) {
            this._dragging = true;
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

  _onPointerUp = (event: PointerEvent): void => {
    this.onPointerUp(event);
    if (this._pointerDown) {
      if (this._dragging) {
        this.onDragEnd(event);
      } else {
        this.onTap(event);
      }
    }
    this._pointerDown = false;
    this._dragging = false;
  };

  _onTouchEnd = (event: TouchEvent): void => {
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
      this._onPointerUp(pointerEvent);
    }
  };

  bind(): void {
    this.view.addEventListener("pointerdown", this._onPointerDown);
    this.view.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("mouseup", this._onPointerUp);
    window.addEventListener("touchend", this._onTouchEnd);
  }

  unbind(): void {
    this.view.removeEventListener("pointerdown", this._onPointerDown);
    this.view.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("mouseup", this._onPointerUp);
    window.removeEventListener("touchend", this._onTouchEnd);
  }

  isPointerDown(): boolean {
    return this._pointerDown;
  }

  isDragging(): boolean {
    return this._dragging;
  }

  onPointerDown(_event: PointerEvent): void {
    // NoOp
  }

  onPointerMove(_event: PointerEvent): void {
    // NoOp
  }

  onPointerUp(_event: PointerEvent): void {
    // NoOp
  }

  onTap(_event: PointerEvent): void {
    // NoOp
  }

  onDragStart(
    _event: PointerEvent,
    _dragThreshold: number,
    _distanceX: number,
    _distanceY: number
  ): void {
    // NoOp
  }

  onDrag(_event: PointerEvent): void {
    // NoOp
  }

  onDragEnd(_event: PointerEvent): void {
    // NoOp
  }
}

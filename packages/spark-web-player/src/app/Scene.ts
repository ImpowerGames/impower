import * as THREE from "three/src/scenes/Scene.js";
import { SparkContext } from "../../../spark-engine/src";
import Application from "./Application";
import { Disposable } from "./Disposable";

export default class Scene extends THREE.Scene {
  protected _context: SparkContext;
  public get context(): SparkContext {
    return this._context;
  }

  protected _app: Application;

  protected _active = true;
  public get active(): boolean {
    return this._active;
  }
  public set active(value: boolean) {
    this._active = value;
  }

  public get screen() {
    return this._app.screen;
  }

  public get view() {
    return this._app.view;
  }

  public get renderer() {
    return this._app.renderer;
  }

  // TODO:
  // protected _assets: SparkAssets;
  // public get assets(): SparkAssets {
  //   return this._assets;
  // }

  public get maxFPS(): number {
    return this._app.ticker?.maxFPS;
  }

  public get ticker() {
    return this._app.ticker;
  }

  public get camera() {
    return this._app.camera;
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

  protected _time = 0;
  public get time() {
    return this._time;
  }

  constructor(
    context: SparkContext,
    app: Application
    // assets: SparkAssets
  ) {
    super();
    this._context = context;
    this._app = app;
    // this._assets = assets;
    this.bind();
  }

  getRequiredAssets(): Record<string, { src: string; ext: string }> {
    return {};
  }

  async load(): Promise<Disposable[]> {
    // NoOp
    return [];
  }

  init(): void {
    // NoOp
  }

  tick(deltaMS: number): void {
    this._time += deltaMS;
  }

  update(_deltaMS: number): void {
    // NoOp
  }

  step(_deltaMS: number): void {
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

  dispose(): void {
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

  _onPointerUp = (event: MouseEvent): void => {
    const pointerEvent = event as PointerEvent;
    this.onPointerUp(pointerEvent);
    if (this._pointerDown) {
      if (this._dragging) {
        this.onDragEnd(pointerEvent);
      } else {
        this.onTap(pointerEvent);
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

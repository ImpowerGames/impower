import { Object3D } from "three";
import * as THREE from "three/src/scenes/Scene.js";
import {
  Message,
  NotificationMessage,
  RequestMessage,
  ResponseError,
} from "../../../spark-engine/src/game/core";
import Application from "./Application";
import { Disposable } from "./Disposable";

export default class Scene extends THREE.Scene {
  protected _app: Application;

  get screen() {
    return this._app.screen;
  }

  get view() {
    return this._app.view;
  }

  get canvas() {
    return this._app.canvas;
  }

  get overlay() {
    return this._app.overlay;
  }

  get renderer() {
    return this._app.renderer;
  }

  get maxFPS() {
    return this._app.ticker?.maxFPS;
  }

  get ticker() {
    return this._app.ticker;
  }

  get camera() {
    return this._app.camera;
  }

  get connection() {
    return this._app.connection;
  }

  protected _ready = false;
  get ready(): boolean {
    return this._ready;
  }
  set ready(value: boolean) {
    this._ready = value;
  }

  // TODO:
  // protected _assets: SparkAssets;
  // public get assets(): SparkAssets {
  //   return this._assets;
  // }

  protected _pointerDown = false;
  get pointerDown(): boolean {
    return this._pointerDown;
  }

  protected _pointerDownX = 0;
  get pointerDownX(): number {
    return this._pointerDownX;
  }

  protected _pointerDownY = 0;
  get pointerDownY(): number {
    return this._pointerDownY;
  }

  protected _dragging = false;
  get dragging(): boolean {
    return this._dragging;
  }

  protected _mouseDragThreshold = 1;
  get mouseDragThreshold(): number {
    return this._mouseDragThreshold;
  }
  set mouseDragThreshold(value: number) {
    this._mouseDragThreshold = value;
  }

  protected _penDragThreshold = 2;
  get penDragThreshold(): number {
    return this._penDragThreshold;
  }
  set penDragThreshold(value: number) {
    this._penDragThreshold = value;
  }

  protected _touchDragThreshold = 4;
  get touchDragThreshold(): number {
    return this._touchDragThreshold;
  }
  set touchDragThreshold(value: number) {
    this._touchDragThreshold = value;
  }

  protected _time = 0;
  get time() {
    return this._time;
  }

  constructor(
    app: Application
    // assets: SparkAssets
  ) {
    super();
    this._app = app;
    // this._assets = assets;
  }

  getRequiredAssets(): Record<string, { src: string; ext: string }> {
    return {};
  }

  async onLoad(): Promise<Object3D[]> {
    // NoOp
    return [];
  }

  onStart(): void {
    // NoOp
  }

  onTick(deltaMS: number): void {
    this._time += deltaMS;
  }

  onUpdate(_deltaMS: number): void {
    // NoOp
  }

  onStep(_deltaMS: number): void {
    // NoOp
  }

  onPause(): void {
    // NoOp
  }

  onUnpause(): void {
    // NoOp
  }

  onResize(_entry: ResizeObserverEntry): void {
    // NoOp
  }

  onReset(): void {
    // NoOp
  }

  onDispose(): Disposable[] {
    // NoOp
    return [];
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
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", this._onPointerDown);
      this.canvas.addEventListener("pointermove", this._onPointerMove);
    }
    window.addEventListener("mouseup", this._onPointerUp);
    window.addEventListener("touchend", this._onTouchEnd);
  }

  protected onBind(): void {}

  unbind(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this._onPointerDown);
      this.canvas.removeEventListener("pointermove", this._onPointerMove);
    }
    window.removeEventListener("mouseup", this._onPointerUp);
    window.removeEventListener("touchend", this._onTouchEnd);
  }

  protected onUnbind(): void {}

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

  onReceiveNotification(_msg: NotificationMessage): void {}

  async onReceiveRequest(
    _msg: RequestMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  emit(message: Message, transfer?: ArrayBuffer[]) {
    this._app.emit(message, transfer);
  }
}

import {
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
  Ticker,
} from "@impower/spark-engine/src/game/core";
import { Container } from "pixi.js";
import { Application } from "./Application";
import { Camera } from "./plugins/projection/camera/camera";
import { CameraOrbitControl } from "./plugins/projection/camera/camera-orbit-control";

export class World {
  protected _app: Application;

  get screen() {
    return this._app.screen;
  }

  get canvas() {
    return this._app.canvas;
  }

  get renderer() {
    return this._app.renderer;
  }

  get stage() {
    return this._app.stage;
  }

  public get dolly(): CameraOrbitControl {
    return this._app.dolly;
  }

  public get camera(): Camera {
    return this._app.camera;
  }

  constructor(app: Application) {
    this._app = app;
  }

  async onLoad(): Promise<Container[]> {
    return [];
  }

  onStart(): void {}

  onUpdate(_time: Ticker): void {}

  onStep(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(_width: number, _height: number, _resolution: number): void {}

  onDispose() {}

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

  bind(): void {
    if (this.canvas) {
      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
    }
    window.addEventListener("mouseup", this.handlePointerUp);
    window.addEventListener("touchend", this.handleTouchEnd);
  }

  unbind(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    }
    window.removeEventListener("mouseup", this.handlePointerUp);
    window.removeEventListener("touchend", this.handleTouchEnd);
  }

  protected handlePointerDown = (event: PointerEvent): void => {
    this.onPointerDown(event);
    this._pointerDown = true;
    this._dragging = false;
    this._pointerDownX = event.offsetX;
    this._pointerDownY = event.offsetY;
  };

  protected handlePointerMove = (event: PointerEvent): void => {
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

  protected handlePointerUp = (event: MouseEvent): void => {
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

  protected handleTouchEnd = (event: TouchEvent): void => {
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

  onPointerDown(_event: PointerEvent): void {}

  onPointerMove(_event: PointerEvent): void {}

  onPointerUp(_event: PointerEvent): void {}

  onTap(_event: PointerEvent): void {}

  onDragStart(
    _event: PointerEvent,
    _dragThreshold: number,
    _distanceX: number,
    _distanceY: number
  ): void {}

  onDrag(_event: PointerEvent): void {}

  onDragEnd(_event: PointerEvent): void {}

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
}

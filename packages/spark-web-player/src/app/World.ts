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
import {
  generateAnimatedSVGTexture,
  GenerateAnimatedSVGTextureOptions,
} from "./plugins/svg/utils/generateAnimatedSVGTexture";
import {
  generateAnimatedSVGTextures,
  GenerateAnimatedSVGTexturesOptions,
} from "./plugins/svg/utils/generateAnimatedSVGTextures";
import { parseSVG } from "./plugins/svg/utils/parseSVG";
import { generateSolidTexture } from "./plugins/texture/utils/generateSolidTexture";

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

  private handlePointerDown = (event: PointerEvent): void => {
    this.onPointerDown(event);
    this._pointerDown = true;
    this._pointerDragging = false;
    this._pointerDownX = event.offsetX;
    this._pointerDownY = event.offsetY;
  };

  private handlePointerMove = (event: PointerEvent): void => {
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

  texture(width: number, height: number, color?: number) {
    return generateSolidTexture(this.renderer, width, height, color);
  }

  svgTextures(svg: string, options?: GenerateAnimatedSVGTexturesOptions) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTextures(this.renderer, svgEl, options);
  }

  svgTexture(svg: string, options?: GenerateAnimatedSVGTextureOptions) {
    const svgEl = parseSVG(svg);
    return generateAnimatedSVGTexture(this.renderer, svgEl, 0, options);
  }
}

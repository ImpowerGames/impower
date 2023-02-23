import { SparkContext } from "../../../../spark-engine";
import { Application } from "../plugins/app";
import { Assets } from "../plugins/assets";
import { IRenderer, Rectangle } from "../plugins/core";
import { CameraOrbitControl, Container3D } from "../plugins/projection";
import { Ticker } from "../plugins/ticker";

export class SparkScene {
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

  public get renderer(): IRenderer {
    return this._app.renderer;
  }

  public get assets(): Assets {
    return this._app.assets;
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

  private _pointerDown = false;

  public get pointerDown(): boolean {
    return this._pointerDown;
  }

  private _pointerDownX = 0;

  public get pointerDownX(): number {
    return this._pointerDownX;
  }

  private _pointerDownY = 0;

  public get pointerDownY(): number {
    return this._pointerDownY;
  }

  private _dragging = false;

  public get dragging(): boolean {
    return this._dragging;
  }

  private _dragThreshold = 8;

  public get dragThreshold(): number {
    return this._dragThreshold;
  }

  public set dragThreshold(value: number) {
    this._dragThreshold = value;
  }

  constructor(context: SparkContext, app: Application) {
    this._context = context;
    this._app = app;
  }

  async load(): Promise<void> {
    // NoOp
  }

  init(): void {
    // NoOp
  }

  start(): void {
    // NoOp
  }

  update(_delta?: number): boolean {
    // NoOp
    return false;
  }

  destroy(): void {
    // NoOp
  }

  resize(): void {
    // NoOp
  }

  bind(): void {
    this.view.addEventListener("pointerdown", (event) => {
      this._pointerDown = true;
      this._dragging = false;
      this._pointerDownX = event.offsetX;
      this._pointerDownY = event.offsetY;
    });
    this.view.addEventListener("pointermove", (event) => {
      if (this._pointerDown) {
        const pointerX = event.offsetX;
        const pointerY = event.offsetY;
        const dragDistance =
          (pointerX - this._pointerDownX) ** 2 +
          (pointerY - this._pointerDownY) ** 2;
        if (dragDistance > this._dragThreshold) {
          this._dragging = true;
          this.onDrag(event);
        }
      }
    });
    this.view.addEventListener("pointerup", (event) => {
      if (this._pointerDown && !this._dragging) {
        this.onTap(event);
      }
      this._pointerDown = false;
      this._dragging = false;
    });
  }

  onTap(_event: PointerEvent): void {
    // NoOp
  }

  onDrag(_event: PointerEvent): void {
    // NoOp
  }
}

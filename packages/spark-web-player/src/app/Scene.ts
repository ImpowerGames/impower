import {
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Container } from "pixi.js";
import { Application } from "./Application";

export class Scene {
  protected _app: Application;
  get stage() {
    return this._app.stage;
  }

  get screen() {
    return this._app.screen;
  }

  get renderer() {
    return this._app.renderer;
  }

  constructor(app: Application) {
    this._app = app;
  }

  async onLoad(): Promise<Container[]> {
    return [];
  }

  onStart(): void {}

  onUpdate(_elapsedTime: number): void {}

  onStep(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(_width: number, _height: number, _resolution: number): void {}

  onDispose() {}

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

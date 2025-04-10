import {
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Application, Container } from "pixi.js";

export class Scene {
  protected _app: Application;
  get app() {
    return this._app;
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

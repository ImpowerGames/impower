import {
  type Message,
  type NotificationMessage,
  type RequestMessage,
  type ResponseError,
} from "@impower/spark-engine/src/game/core";
import { type Application } from "./Application";

export class Manager {
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

  get ticker() {
    return this._app.ticker;
  }

  get audioContext() {
    return this._app.audioContext;
  }

  constructor(app: Application) {
    this._app = app;
  }

  onStart(): void {
    // NoOp
  }

  onUpdate(): void {
    // NoOp
  }

  onStep(_seconds: number): void {
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

  onDispose() {
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

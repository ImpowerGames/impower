import {
  Clock,
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

  get clock() {
    return this._app.clock;
  }

  get audioContext() {
    return this._app.audioContext;
  }

  get context() {
    return this._app.context;
  }

  get stage() {
    return this._app.stage;
  }

  constructor(app: Application) {
    this._app = app;
  }

  async onInit(): Promise<void> {}

  onStart(): void {}

  onUpdate(time: Clock): void {}

  onSkip(seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(width: number, height: number, resolution: number): void {}

  onDispose() {}

  onReceiveNotification(msg: NotificationMessage): void {}

  async onReceiveRequest(
    msg: RequestMessage
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

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

  get ticker() {
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

  onUpdate(_time: Clock): void {}

  onSkip(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(_width: number, _height: number, _resolution: number): void {}

  onDispose() {}

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

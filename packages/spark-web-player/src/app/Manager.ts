import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { type Message } from "../../../spark-engine/src/game/core/types/Message";
import { type NotificationMessage } from "../../../spark-engine/src/game/core/types/NotificationMessage";
import { type RequestMessage } from "../../../spark-engine/src/game/core/types/RequestMessage";
import { type ResponseError } from "../../../spark-engine/src/game/core/types/ResponseError";
import { type IApplication } from "./IApplication";

export class Manager {
  protected _app: IApplication;

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

  constructor(app: IApplication) {
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

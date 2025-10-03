import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { type NotificationMessage } from "../../../spark-engine/src/protocol/types/NotificationMessage";
import { type RequestMessage } from "../../../spark-engine/src/protocol/types/RequestMessage";
import { type ResponseError } from "../../../spark-engine/src/protocol/types/ResponseError";
import { type IApplication } from "./IApplication";

export class Manager {
  protected get app() {
    return this._app;
  }
  private _app: IApplication;

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
}

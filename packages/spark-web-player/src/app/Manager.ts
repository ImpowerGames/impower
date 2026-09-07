import { type NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { type RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { type ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import { type Clock } from "../../../spark-engine/src/game/core/classes/Clock";
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

  onUpdate(_time: Clock): void {}

  onSkip(_seconds: number): void {}

  onPause(): void {}

  onUnpause(): void {}

  onResize(_width: number, _height: number, _resolution: number): void {}

  onDispose() {}

  onReceiveNotification(_msg: NotificationMessage): void {}

  async onReceiveRequest(
    _msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }
}

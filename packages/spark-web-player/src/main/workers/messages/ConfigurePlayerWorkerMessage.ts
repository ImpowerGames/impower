import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type ConfigurePlayerWorkerMethod =
  typeof ConfigurePlayerWorkerMessage.method;

export interface ConfigurePlayerWorkerParams {
  /** The stopped preview is displayed from the worker's own game, and the
   *  worker sends the page each program's summary and no checkpoint. */
  workerDisplaysPreview: boolean;
}

/** Sent by the player's workspace before it configures the compiler. */
export class ConfigurePlayerWorkerMessage {
  static readonly method = "player/configure";
  static readonly type = new MessageProtocolRequestType<
    ConfigurePlayerWorkerMethod,
    ConfigurePlayerWorkerParams,
    {}
  >(ConfigurePlayerWorkerMessage.method);
}

export namespace ConfigurePlayerWorkerMessage {
  export interface Request extends RequestMessage<
    ConfigurePlayerWorkerMethod,
    ConfigurePlayerWorkerParams,
    {}
  > {}
}

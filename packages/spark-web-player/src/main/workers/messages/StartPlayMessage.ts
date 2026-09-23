import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type StartPlayMethod = typeof StartPlayMessage.method;

export interface StartPlayParams {
  /** The run to start (`player/play`). */
  run: number;
}

/** Start PLAY's game: it runs, and ticks on the worker's own frames. */
export class StartPlayMessage {
  static readonly method = "player/startPlay";
  static readonly type = new MessageProtocolRequestType<
    StartPlayMethod,
    StartPlayParams,
    {}
  >(StartPlayMessage.method);
}

export namespace StartPlayMessage {
  export interface Request extends RequestMessage<StartPlayMethod, StartPlayParams, {}> {}
}

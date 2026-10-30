import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";

export type StartPlayMethod = typeof StartPlayMessage.method;

export interface StartPlayParams {
  run: number;
  paused?: boolean;
  seconds?: number;
}

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

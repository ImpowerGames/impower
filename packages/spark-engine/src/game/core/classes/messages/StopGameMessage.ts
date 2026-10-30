import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type StopGameMethod = typeof StopGameMessage.method;

export interface StopGameParams {
  restart?: boolean;

  terminate?: boolean;

  suspend?: boolean;
}

export interface StopGameResult {}

export class StopGameMessage {
  static readonly method = "game/stop";
  static readonly type = new MessageProtocolRequestType<
    StopGameMethod,
    StopGameParams,
    StopGameResult
  >(StopGameMessage.method);
}

export namespace StopGameMessage {
  export interface Request extends RequestMessage<
    StopGameMethod,
    StopGameParams,
    StopGameResult
  > {}
  export type Response = ResponseMessage<StopGameMethod, StopGameResult>;
}

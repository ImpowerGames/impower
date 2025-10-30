import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type StopGameMethod = typeof StopGameMessage.method;

export interface StopGameParams {
  /** A value of true indicates that this `disconnect` request is part of a restart sequence. */
  restart?: boolean;

  /** Indicates whether the game should be terminated.
    If unspecified, the debug adapter is free to do whatever it thinks is best.
  */
  terminate?: boolean;

  /** Indicates whether the game should stay suspended.
    If unspecified, the game should resume execution.
  */
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
  export interface Request
    extends RequestMessage<StopGameMethod, StopGameParams, StopGameResult> {}
  export interface Response
    extends ResponseMessage<StopGameMethod, StopGameResult> {}
}

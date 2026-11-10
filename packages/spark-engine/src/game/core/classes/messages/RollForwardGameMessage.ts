import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { RollResult, RollTarget } from "../../types/RunHistory";

export type RollForwardGameMethod = typeof RollForwardGameMessage.method;

export interface RollForwardGameParams {
  to: RollTarget;
  hold?: boolean;
}

export type RollForwardGameResult = RollResult & {
  run?: number | null;
  held?: boolean;
};

export class RollForwardGameMessage {
  static readonly method = "game/rollForward";
  static readonly type = new MessageProtocolRequestType<
    RollForwardGameMethod,
    RollForwardGameParams,
    RollForwardGameResult
  >(RollForwardGameMessage.method);
}

export namespace RollForwardGameMessage {
  export interface Request extends RequestMessage<
    RollForwardGameMethod,
    RollForwardGameParams,
    RollForwardGameResult
  > {}
  export type Response = ResponseMessage<
    RollForwardGameMethod,
    RollForwardGameResult
  >;
}

import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { RollResult, RollTarget } from "../../types/RunHistory";

export type RollBackGameMethod = typeof RollBackGameMessage.method;

export interface RollBackGameParams {
  to: RollTarget;
  choice?: number;
  hold?: boolean;
}

export type RollBackGameResult = RollResult & {
  run?: number | null;
  held?: boolean;
};

export class RollBackGameMessage {
  static readonly method = "game/rollBack";
  static readonly type = new MessageProtocolRequestType<
    RollBackGameMethod,
    RollBackGameParams,
    RollBackGameResult
  >(RollBackGameMessage.method);
}

export namespace RollBackGameMessage {
  export interface Request extends RequestMessage<
    RollBackGameMethod,
    RollBackGameParams,
    RollBackGameResult
  > {}
  export type Response = ResponseMessage<RollBackGameMethod, RollBackGameResult>;
}

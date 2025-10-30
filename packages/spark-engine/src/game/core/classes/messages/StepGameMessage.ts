import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type StepGameMethod = typeof StepGameMessage.method;

export interface StepGameParams {
  traversal: "in" | "out" | "over";
  reverse?: boolean;
}

export interface StepGameResult {
  done: boolean;
}

export class StepGameMessage {
  static readonly method = "game/step";
  static readonly type = new MessageProtocolRequestType<
    StepGameMethod,
    StepGameParams,
    StepGameResult
  >(StepGameMessage.method);
}

export namespace StepGameMessage {
  export interface Request
    extends RequestMessage<StepGameMethod, StepGameParams, StepGameResult> {}
  export interface Response
    extends ResponseMessage<StepGameMethod, StepGameResult> {}
}

import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type GetGameEvaluationContextMethod =
  typeof GetGameEvaluationContextMessage.method;

export interface GetGameEvaluationContextParams {
  /** The thread of the frame to evaluate in, by default the one that runs. */
  threadId?: number;
  /** The frame to evaluate in, numbered as `game/stackTrace` numbers the
   *  frames of `threadId`; by default the frame that runs. */
  frameId?: number;
}

export interface GetGameEvaluationContextResult {
  context: any;
}

export class GetGameEvaluationContextMessage {
  static readonly method = "game/evaluationContext";
  static readonly type = new MessageProtocolRequestType<
    GetGameEvaluationContextMethod,
    GetGameEvaluationContextParams,
    GetGameEvaluationContextResult
  >(GetGameEvaluationContextMessage.method);
}

export namespace GetGameEvaluationContextMessage {
  export interface Request extends RequestMessage<
    GetGameEvaluationContextMethod,
    GetGameEvaluationContextParams,
    GetGameEvaluationContextResult
  > {}
  export type Response = ResponseMessage<
    GetGameEvaluationContextMethod,
    GetGameEvaluationContextResult
  >;
}

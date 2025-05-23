import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type GetGameEvaluationContextMethod =
  typeof GetGameEvaluationContextMessage.method;

export interface GetGameEvaluationContextParams {}

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
  export interface Request
    extends RequestMessage<
      GetGameEvaluationContextMethod,
      GetGameEvaluationContextParams,
      GetGameEvaluationContextResult
    > {}
  export interface Response
    extends ResponseMessage<
      GetGameEvaluationContextMethod,
      GetGameEvaluationContextResult
    > {}
}

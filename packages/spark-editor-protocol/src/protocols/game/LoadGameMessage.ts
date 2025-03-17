import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type LoadGameMethod = typeof LoadGameMessage.method;

export interface LoadGameParams {
  program: SparkProgram;
}

export interface LoadGameResult {}

export class LoadGameMessage {
  static readonly method = "game/load";
  static readonly type = new MessageProtocolRequestType<
    LoadGameMethod,
    LoadGameParams,
    LoadGameResult
  >(LoadGameMessage.method);
}

export namespace LoadGameMessage {
  export interface Request
    extends RequestMessage<LoadGameMethod, LoadGameParams, LoadGameResult> {}
  export interface Response
    extends ResponseMessage<LoadGameMethod, LoadGameResult> {}
}

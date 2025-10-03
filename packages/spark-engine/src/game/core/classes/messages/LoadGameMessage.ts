import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

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

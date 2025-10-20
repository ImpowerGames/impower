import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { ConfigureGameParams } from "./ConfigureGameMessage";

export type LoadGameMethod = typeof LoadGameMessage.method;

export interface LoadGameParams extends ConfigureGameParams {
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

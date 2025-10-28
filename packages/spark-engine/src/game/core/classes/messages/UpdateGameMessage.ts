import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { GameConfiguration } from "../../types/GameConfiguration";

export type UpdateGameMethod = typeof UpdateGameMessage.method;

export interface UpdateGameParams extends GameConfiguration {
  program: SparkProgram;
}

export interface UpdateGameResult {}

export class UpdateGameMessage {
  static readonly method = "game/update";
  static readonly type = new MessageProtocolRequestType<
    UpdateGameMethod,
    UpdateGameParams,
    UpdateGameResult
  >(UpdateGameMessage.method);
}

export namespace UpdateGameMessage {
  export interface Request
    extends RequestMessage<
      UpdateGameMethod,
      UpdateGameParams,
      UpdateGameResult
    > {}
  export interface Response
    extends ResponseMessage<UpdateGameMethod, UpdateGameResult> {}
}

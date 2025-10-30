import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { GameConfiguration } from "../../types/GameConfiguration";

export type ConnectGameMethod = typeof ConnectGameMessage.method;

export interface ConnectGameParams extends GameConfiguration {}

export interface ConnectGameResult {}

export class ConnectGameMessage {
  static readonly method = "game/connect";
  static readonly type = new MessageProtocolRequestType<
    ConnectGameMethod,
    ConnectGameParams,
    ConnectGameResult
  >(ConnectGameMessage.method);
}

export namespace ConnectGameMessage {
  export interface Request
    extends RequestMessage<
      ConnectGameMethod,
      ConnectGameParams,
      ConnectGameResult
    > {}
  export interface Response
    extends ResponseMessage<ConnectGameMethod, ConnectGameResult> {}
}

import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type GetGameScriptsMethod = typeof GetGameScriptsMessage.method;

export interface GetGameScriptsParams {}

export interface GetGameScriptsResult {
  uris: string[];
}

export class GetGameScriptsMessage {
  static readonly method = "game/scripts";
  static readonly type = new MessageProtocolRequestType<
    GetGameScriptsMethod,
    GetGameScriptsParams,
    GetGameScriptsResult
  >(GetGameScriptsMessage.method);
}

export namespace GetGameScriptsMessage {
  export interface Request
    extends RequestMessage<
      GetGameScriptsMethod,
      GetGameScriptsParams,
      GetGameScriptsResult
    > {}
  export interface Response
    extends ResponseMessage<GetGameScriptsMethod, GetGameScriptsResult> {}
}

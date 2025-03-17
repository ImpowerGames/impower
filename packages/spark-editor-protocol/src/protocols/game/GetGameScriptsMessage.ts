import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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

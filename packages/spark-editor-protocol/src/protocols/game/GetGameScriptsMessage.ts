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

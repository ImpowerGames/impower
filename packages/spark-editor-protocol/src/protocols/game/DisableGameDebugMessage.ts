import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DisableGameDebugMethod = typeof DisableGameDebugMessage.method;

export class DisableGameDebugMessage {
  static readonly method = "game/disableDebug";
  static readonly type = new MessageProtocolRequestType<
    DisableGameDebugMethod,
    {},
    null
  >(DisableGameDebugMessage.method);
}

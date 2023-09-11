import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type EnableGameDebugMethod = typeof EnableGameDebugMessage.method;

export class EnableGameDebugMessage {
  static readonly method = "game/enableDebug";
  static readonly type = new MessageProtocolRequestType<
    EnableGameDebugMethod,
    {},
    null
  >(EnableGameDebugMessage.method);
}

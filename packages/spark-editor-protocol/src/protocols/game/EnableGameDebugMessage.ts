import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type EnableGameDebugMethod = typeof EnableGameDebugMessage.method;

export namespace EnableGameDebugMessage {
  export const method = "game/enableDebug";
  export const type = new MessageProtocolRequestType<
    EnableGameDebugMethod,
    {},
    null
  >(EnableGameDebugMessage.method);
}

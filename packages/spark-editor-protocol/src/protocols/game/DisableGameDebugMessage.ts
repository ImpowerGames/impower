import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DisableGameDebugMethod = typeof DisableGameDebugMessage.method;

export namespace DisableGameDebugMessage {
  export const method = "game/disableDebug";
  export const type = new MessageProtocolRequestType<
    DisableGameDebugMethod,
    {},
    null
  >(DisableGameDebugMessage.method);
}

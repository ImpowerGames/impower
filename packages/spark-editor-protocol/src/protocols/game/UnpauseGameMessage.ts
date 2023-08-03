import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UnpauseGameMethod = typeof UnpauseGameMessage.method;

export namespace UnpauseGameMessage {
  export const method = "game/unpause";
  export const type = new MessageProtocolRequestType<
    UnpauseGameMethod,
    {},
    null
  >(UnpauseGameMessage.method);
}

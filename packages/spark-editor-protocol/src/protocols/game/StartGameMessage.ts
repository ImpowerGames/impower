import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StartGameMethod = typeof StartGameMessage.method;

export namespace StartGameMessage {
  export const method = "game/start";
  export const type = new MessageProtocolRequestType<StartGameMethod, {}, null>(
    StartGameMessage.method
  );
}

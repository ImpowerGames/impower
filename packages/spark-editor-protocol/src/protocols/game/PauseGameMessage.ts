import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type PauseGameMethod = typeof PauseGameMessage.method;

export namespace PauseGameMessage {
  export const method = "game/pause";
  export const type = new MessageProtocolRequestType<PauseGameMethod, {}, null>(
    PauseGameMessage.method
  );
}

import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type PauseGameMethod = typeof PauseGameMessage.method;

export class PauseGameMessage {
  static readonly method = "game/pause";
  static readonly type = new MessageProtocolRequestType<
    PauseGameMethod,
    {},
    null
  >(PauseGameMessage.method);
}

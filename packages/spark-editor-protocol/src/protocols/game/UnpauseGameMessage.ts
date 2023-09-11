import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UnpauseGameMethod = typeof UnpauseGameMessage.method;

export class UnpauseGameMessage {
  static readonly method = "game/unpause";
  static readonly type = new MessageProtocolRequestType<
    UnpauseGameMethod,
    {},
    null
  >(UnpauseGameMessage.method);
}

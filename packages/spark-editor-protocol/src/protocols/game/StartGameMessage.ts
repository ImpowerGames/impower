import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StartGameMethod = typeof StartGameMessage.method;

export class StartGameMessage {
  static readonly method = "game/start";
  static readonly type = new MessageProtocolRequestType<
    StartGameMethod,
    {},
    null
  >(StartGameMessage.method);
}

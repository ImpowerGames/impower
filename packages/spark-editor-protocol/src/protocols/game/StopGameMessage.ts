import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StopGameMethod = typeof StopGameMessage.method;

export class StopGameMessage {
  static readonly method = "game/stop";
  static readonly type = new MessageProtocolRequestType<
    StopGameMethod,
    {},
    null
  >(StopGameMessage.method);
}

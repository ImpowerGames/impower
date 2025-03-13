import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ContinueGameMethod = typeof ContinueGameMessage.method;

export interface ContinueGameParams {
  reverse?: boolean;
}

export class ContinueGameMessage {
  static readonly method = "game/continue";
  static readonly type = new MessageProtocolRequestType<
    ContinueGameMethod,
    ContinueGameParams,
    null
  >(ContinueGameMessage.method);
}

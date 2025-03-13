import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export interface StartGameParams {
  stopOnEntry?: boolean;
  debug?: boolean;
}

export type StartGameMethod = typeof StartGameMessage.method;

export class StartGameMessage {
  static readonly method = "game/start";
  static readonly type = new MessageProtocolRequestType<
    StartGameMethod,
    StartGameParams,
    boolean
  >(StartGameMessage.method);
}

import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameSteppedMethod = typeof GameSteppedMessage.method;

export interface GameSteppedParams {}

export class GameSteppedMessage {
  static readonly method = "game/stepped";
  static readonly type = new MessageProtocolNotificationType<
    GameSteppedMethod,
    GameSteppedParams
  >(GameSteppedMessage.method);
}

import { type Location } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameContinuedMethod = typeof GameContinuedMessage.method;

export interface GameContinuedParams {
  location: Location;
}

export class GameContinuedMessage {
  static readonly method = "game/continued";
  static readonly type = new MessageProtocolNotificationType<
    GameContinuedMethod,
    GameContinuedParams
  >(GameContinuedMessage.method);
}

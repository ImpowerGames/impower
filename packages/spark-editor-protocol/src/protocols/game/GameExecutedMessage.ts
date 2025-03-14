import { type Location } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  location: Location;
  frameId: number;
}

export class GameExecutedMessage {
  static readonly method = "game/executed";
  static readonly type = new MessageProtocolNotificationType<
    GameExecutedMethod,
    GameExecutedParams
  >(GameExecutedMessage.method);
}

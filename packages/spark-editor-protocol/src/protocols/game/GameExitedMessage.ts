import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameExitedMethod = typeof GameExitedMessage.method;

export interface GameExitedParams {
  reason: "finished" | "quit" | "invalidated" | "error";
  error?: {
    message: string;
    location: Location;
  };
}

export class GameExitedMessage {
  static readonly method = "game/exited";
  static readonly type = new MessageProtocolNotificationType<
    GameExitedMethod,
    GameExitedParams
  >(GameExitedMessage.method);
}

export namespace GameExitedMessage {
  export interface Notification
    extends NotificationMessage<GameExitedMethod, GameExitedParams> {}
}

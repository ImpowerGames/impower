import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  locations: Location[];
  path: string;
  state: "initial" | "running" | "previewing" | "paused";
  restarted?: boolean;
}

export class GameExecutedMessage {
  static readonly method = "game/executed";
  static readonly type = new MessageProtocolNotificationType<
    GameExecutedMethod,
    GameExecutedParams
  >(GameExecutedMessage.method);
}

export namespace GameExecutedMessage {
  export interface Notification
    extends NotificationMessage<GameExecutedMethod, GameExecutedParams> {}
}

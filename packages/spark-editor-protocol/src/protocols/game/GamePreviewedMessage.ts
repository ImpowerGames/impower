import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GamePreviewedMethod = typeof GamePreviewedMessage.method;

export interface GamePreviewedParams {
  location: Location;
  path: string;
}

export class GamePreviewedMessage {
  static readonly method = "game/previewed";
  static readonly type = new MessageProtocolNotificationType<
    GamePreviewedMethod,
    GamePreviewedParams
  >(GamePreviewedMessage.method);
}

export namespace GamePreviewedMessage {
  export interface Notification
    extends NotificationMessage<GamePreviewedMethod, GamePreviewedParams> {}
}

import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameClickedToContinueMethod =
  typeof GameClickedToContinueMessage.method;

export interface GameClickedToContinueParams {
  location: Location;
}

export class GameClickedToContinueMessage {
  static readonly method = "game/clickedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameClickedToContinueMethod,
    GameClickedToContinueParams
  >(GameClickedToContinueMessage.method);
}

export namespace GameClickedToContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameClickedToContinueMethod,
      GameClickedToContinueParams
    > {}
}

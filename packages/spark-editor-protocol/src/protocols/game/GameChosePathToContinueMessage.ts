import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameChosePathToContinueMethod =
  typeof GameChosePathToContinueMessage.method;

export interface GameChosePathToContinueParams {
  location: Location;
}

export class GameChosePathToContinueMessage {
  static readonly method = "game/chosePathToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameChosePathToContinueMethod,
    GameChosePathToContinueParams
  >(GameChosePathToContinueMessage.method);
}

export namespace GameChosePathToContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameChosePathToContinueMethod,
      GameChosePathToContinueParams
    > {}
}

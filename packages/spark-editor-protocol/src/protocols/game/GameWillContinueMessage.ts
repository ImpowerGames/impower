import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameWillContinueMethod = typeof GameWillContinueMessage.method;

export interface GameWillContinueParams {
  location: Location;
  path: string;
}

export class GameWillContinueMessage {
  static readonly method = "game/willContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameWillContinueMethod,
    GameWillContinueParams
  >(GameWillContinueMessage.method);
}

export namespace GameWillContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameWillContinueMethod,
      GameWillContinueParams
    > {}
}

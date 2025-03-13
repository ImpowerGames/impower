import { type Location } from "vscode-languageserver-protocol";
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

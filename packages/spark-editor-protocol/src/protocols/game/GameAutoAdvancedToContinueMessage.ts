import { type Location } from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameAutoAdvancedToContinueMethod =
  typeof GameAutoAdvancedToContinueMessage.method;

export interface GameAutoAdvancedToContinueParams {
  location: Location;
}

export class GameAutoAdvancedToContinueMessage {
  static readonly method = "game/autoAdvancedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameAutoAdvancedToContinueMethod,
    GameAutoAdvancedToContinueParams
  >(GameAutoAdvancedToContinueMessage.method);
}

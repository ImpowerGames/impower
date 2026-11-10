import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type GameToggledConsoleMethod = typeof GameToggledConsoleMessage.method;

export interface GameToggledConsoleParams {
  open: boolean;
}

export class GameToggledConsoleMessage {
  static readonly method = "game/toggledConsole";
  static readonly type = new MessageProtocolNotificationType<
    GameToggledConsoleMethod,
    GameToggledConsoleParams
  >(GameToggledConsoleMessage.method);
}

export namespace GameToggledConsoleMessage {
  export interface Notification extends NotificationMessage<
    GameToggledConsoleMethod,
    GameToggledConsoleParams
  > {}
}

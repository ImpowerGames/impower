import { MessageProtocolNotificationType } from "../../../../protocol/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "../../../../protocol/types/NotificationMessage";

export type GameToggledFullscreenModeMethod =
  typeof GameToggledFullscreenModeMessage.method;

export interface GameToggledFullscreenModeParams {}

export class GameToggledFullscreenModeMessage {
  static readonly method = "game/toggledFullscreen";
  static readonly type = new MessageProtocolNotificationType<
    GameToggledFullscreenModeMethod,
    GameToggledFullscreenModeParams
  >(GameToggledFullscreenModeMessage.method);
}

export namespace GameToggledFullscreenModeMessage {
  export interface Notification
    extends NotificationMessage<
      GameToggledFullscreenModeMethod,
      GameToggledFullscreenModeParams
    > {}
}

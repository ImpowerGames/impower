import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

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

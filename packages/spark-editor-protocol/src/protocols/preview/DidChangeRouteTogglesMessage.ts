import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";
import type { RouteTogglesParams } from "./SetRouteTogglesMessage";

export type DidChangeRouteTogglesMethod =
  typeof DidChangeRouteTogglesMessage.method;

/** The author showed or hid a kind in the Game Preview's route list: every
 *  kind's state, for the host to keep and send back with
 *  `preview/setRouteToggles` when a player connects. */
export interface DidChangeRouteTogglesParams {
  toggles: RouteTogglesParams;
}

export class DidChangeRouteTogglesMessage {
  static readonly method = "preview/didChangeRouteToggles";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeRouteTogglesMethod,
    DidChangeRouteTogglesParams
  >(DidChangeRouteTogglesMessage.method);
}

export namespace DidChangeRouteTogglesMessage {
  export interface Notification extends NotificationMessage<
    DidChangeRouteTogglesMethod,
    DidChangeRouteTogglesParams
  > {}
}

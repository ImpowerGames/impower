import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";
import type { RouteTogglesParams } from "./SetRouteTogglesMessage";

export type DidChangeRouteTogglesMethod =
  typeof DidChangeRouteTogglesMessage.method;

export interface DidChangeRouteTogglesParams {
  toggles: RouteTogglesParams;
  tab?: "route" | "values";
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

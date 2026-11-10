import { MessageProtocolNotificationType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import type { RouteKind, RoutePinChange, RouteViewState } from "./routeView";

export type HostedRouteView = Omit<RouteViewState, "values" | "tab">;

export type DidChangeRouteViewMethod = typeof DidChangeRouteViewMessage.method;

export interface DidChangeRouteViewParams {
  view: HostedRouteView | null;
}

export class DidChangeRouteViewMessage {
  static readonly method = "preview/didChangeRouteView";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeRouteViewMethod,
    DidChangeRouteViewParams
  >(DidChangeRouteViewMessage.method);
}

export namespace DidChangeRouteViewMessage {
  export interface Notification extends NotificationMessage<
    DidChangeRouteViewMethod,
    DidChangeRouteViewParams
  > {}
}

export type RouteViewAction =
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "toggle"; routeKind: RouteKind; shown: boolean }
  | { kind: "changePins"; change: RoutePinChange }
  | { kind: "pinLastRun" };

export type RouteViewActionMethod = typeof RouteViewActionMessage.method;

export interface RouteViewActionParams {
  action: RouteViewAction;
}

export class RouteViewActionMessage {
  static readonly method = "preview/routeViewAction";
  static readonly type = new MessageProtocolNotificationType<
    RouteViewActionMethod,
    RouteViewActionParams
  >(RouteViewActionMessage.method);
}

export namespace RouteViewActionMessage {
  export interface Notification extends NotificationMessage<
    RouteViewActionMethod,
    RouteViewActionParams
  > {}
}

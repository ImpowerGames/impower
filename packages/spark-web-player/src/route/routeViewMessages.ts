import { MessageProtocolNotificationType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import type { SaveRow } from "../saves/savesView";
import type { RouteKind, RoutePinChange, RouteViewState } from "./routeView";
import type { RouteTab } from "./startingValuesView";

export interface HostedRouteView extends RouteViewState {
  load?: { saves: SaveRow[]; open: boolean };
}

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
  | { kind: "pinLastRun" }
  | { kind: "tab"; tab: RouteTab }
  | { kind: "values"; event: HostedValuesEvent };

export type HostedValuesEvent =
  | { kind: "set"; key: string; value: string }
  | { kind: "clear"; key: string }
  | { kind: "draft"; key: string; text: string | null }
  | { kind: "resetAll" }
  | { kind: "search"; search: string }
  | { kind: "undoLoad" }
  | { kind: "loadOpen"; open: boolean }
  | { kind: "loadPick"; id: string };

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

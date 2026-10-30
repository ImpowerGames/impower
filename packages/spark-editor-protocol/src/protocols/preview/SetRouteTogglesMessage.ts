import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetRouteTogglesMethod = typeof SetRouteTogglesMessage.method;

export type RouteTogglesParams = Partial<
  Record<"pinned" | "auto" | "forced" | "clipped", boolean>
>;

export interface SetRouteTogglesParams {
  toggles: RouteTogglesParams;
}

export interface SetRouteTogglesResult {}

export class SetRouteTogglesMessage {
  static readonly method = "preview/setRouteToggles";
  static readonly type = new MessageProtocolRequestType<
    SetRouteTogglesMethod,
    SetRouteTogglesParams,
    SetRouteTogglesResult
  >(SetRouteTogglesMessage.method);
}

export namespace SetRouteTogglesMessage {
  export interface Request extends RequestMessage<
    SetRouteTogglesMethod,
    SetRouteTogglesParams,
    SetRouteTogglesResult
  > {}
  export type Response = ResponseMessage<
    SetRouteTogglesMethod,
    SetRouteTogglesResult
  >;
}

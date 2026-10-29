import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetRouteTogglesMethod = typeof SetRouteTogglesMessage.method;

/** Which kinds of decision the Game Preview's route list shows, by kind:
 *  `pinned`, `auto`, `forced` and `clipped`. A kind it leaves out is shown. */
export type RouteTogglesParams = Partial<
  Record<"pinned" | "auto" | "forced" | "clipped", boolean>
>;

/**
 * The author's choice of what the route list shows, which the host keeps for
 * the author (`preview/didChangeRouteToggles`) and sends whenever a player
 * connects. The player starts with every kind shown.
 */
export interface SetRouteTogglesParams {
  toggles: RouteTogglesParams;
  tab?: "route" | "values";
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

import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import type { RoutePin } from "./SetRoutePinsMessage";

export type ChangeRoutePinsMethod = typeof ChangeRoutePinsMessage.method;

/**
 * The author changed pins from the Game Preview's route list: the player
 * asks the host to remove every pin first when `removeAll` is set, then the
 * pins `remove` names, then to add the pins `add` names. Pinning an option at
 * a stop removes the other pins at that stop in the same request.
 */
export interface ChangeRoutePinsParams {
  add?: RoutePin[];
  remove?: RoutePin[];
  removeAll?: boolean;
}

/** Every pin the host keeps once it has saved the change. A host that does
 *  not save it answers with an error, and the player returns the control to
 *  its previous state. */
export interface ChangeRoutePinsResult {
  pins: RoutePin[];
}

export class ChangeRoutePinsMessage {
  static readonly method = "preview/changeRoutePins";
  static readonly type = new MessageProtocolRequestType<
    ChangeRoutePinsMethod,
    ChangeRoutePinsParams,
    ChangeRoutePinsResult
  >(ChangeRoutePinsMessage.method);
}

export namespace ChangeRoutePinsMessage {
  export interface Request extends RequestMessage<
    ChangeRoutePinsMethod,
    ChangeRoutePinsParams,
    ChangeRoutePinsResult
  > {}
  export type Response = ResponseMessage<
    ChangeRoutePinsMethod,
    ChangeRoutePinsResult
  >;
}

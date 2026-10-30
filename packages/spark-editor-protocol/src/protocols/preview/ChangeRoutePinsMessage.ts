import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import type { RoutePin } from "./SetRoutePinsMessage";

export type ChangeRoutePinsMethod = typeof ChangeRoutePinsMessage.method;

export interface ChangeRoutePinsParams {
  add?: RoutePin[];
  remove?: RoutePin[];
  removeAll?: boolean;
}

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

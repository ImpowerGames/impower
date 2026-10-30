import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetRoutePinsMethod = typeof SetRoutePinsMessage.method;

export interface RoutePin {
  uri: string;
  line: number;
  offer: number;
}

export interface SetRoutePinsParams {
  pins: RoutePin[];
}

export interface SetRoutePinsResult {}

export class SetRoutePinsMessage {
  static readonly method = "preview/setRoutePins";
  static readonly type = new MessageProtocolRequestType<
    SetRoutePinsMethod,
    SetRoutePinsParams,
    SetRoutePinsResult
  >(SetRoutePinsMessage.method);
}

export namespace SetRoutePinsMessage {
  export interface Request extends RequestMessage<
    SetRoutePinsMethod,
    SetRoutePinsParams,
    SetRoutePinsResult
  > {}
  export type Response = ResponseMessage<
    SetRoutePinsMethod,
    SetRoutePinsResult
  >;
}

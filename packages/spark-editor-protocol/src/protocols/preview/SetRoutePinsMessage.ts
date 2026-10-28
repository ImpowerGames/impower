import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetRoutePinsMethod = typeof SetRoutePinsMessage.method;

/**
 * A pin on the option the Game Preview takes at a menu: the option's line in
 * the script `uri`, counting from 0, and which time the route is offered the
 * option, from 1.
 */
export interface RoutePin {
  uri: string;
  line: number;
  offer: number;
}

/**
 * Every pin in the project, which the host keeps for the author and sends
 * when a player connects and whenever they change, an edit moving one
 * included. The player hands them to the games that plan routes, which match
 * each pin's line to the program's option at each compile.
 */
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

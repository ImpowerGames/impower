import { Location } from "vscode-languageserver-protocol";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type GetGamePossibleBreakpointLocationsMethod =
  typeof GetGamePossibleBreakpointLocationsMessage.method;

export interface GetGamePossibleBreakpointLocationsParams {
  search: Location;
}

export interface GetGamePossibleBreakpointLocationsResult {
  /**
   * All possible lines that a breakpoint could be set.
   */
  lines: number[];
}

export class GetGamePossibleBreakpointLocationsMessage {
  static readonly method = "game/possibleBreakpointLocations";
  static readonly type = new MessageProtocolRequestType<
    GetGamePossibleBreakpointLocationsMethod,
    GetGamePossibleBreakpointLocationsParams,
    GetGamePossibleBreakpointLocationsResult
  >(GetGamePossibleBreakpointLocationsMessage.method);
}

export namespace GetGamePossibleBreakpointLocationsMessage {
  export interface Request
    extends RequestMessage<
      GetGamePossibleBreakpointLocationsMethod,
      GetGamePossibleBreakpointLocationsParams,
      GetGamePossibleBreakpointLocationsResult
    > {}
  export interface Response
    extends ResponseMessage<
      GetGamePossibleBreakpointLocationsMethod,
      GetGamePossibleBreakpointLocationsResult
    > {}
}

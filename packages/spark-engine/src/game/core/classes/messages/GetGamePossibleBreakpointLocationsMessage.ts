import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GetGamePossibleBreakpointLocationsMethod =
  typeof GetGamePossibleBreakpointLocationsMessage.method;

export interface GetGamePossibleBreakpointLocationsParams {
  search: DocumentLocation;
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

import { Location } from "vscode-languageserver-protocol";
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

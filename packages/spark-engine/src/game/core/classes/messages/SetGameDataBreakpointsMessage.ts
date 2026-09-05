import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { Breakpoint } from "../../types/Breakpoint";

export type SetGameDataBreakpointsMethod =
  typeof SetGameDataBreakpointsMessage.method;

export interface SetGameDataBreakpointsParams {
  dataBreakpoints: { dataId: string }[];
}

export interface SetGameDataBreakpointsResult {
  dataBreakpoints: Breakpoint[];
}

export class SetGameDataBreakpointsMessage {
  static readonly method = "game/setDataBreakpoints";
  static readonly type = new MessageProtocolRequestType<
    SetGameDataBreakpointsMethod,
    SetGameDataBreakpointsParams,
    SetGameDataBreakpointsResult
  >(SetGameDataBreakpointsMessage.method);
}

export namespace SetGameDataBreakpointsMessage {
  export interface Request extends RequestMessage<
    SetGameDataBreakpointsMethod,
    SetGameDataBreakpointsParams,
    SetGameDataBreakpointsResult
  > {}
  export interface Response extends ResponseMessage<
    SetGameDataBreakpointsMethod,
    SetGameDataBreakpointsResult
  > {}
}

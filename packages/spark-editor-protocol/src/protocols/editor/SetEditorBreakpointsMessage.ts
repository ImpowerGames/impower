import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorBreakpointsMethod = typeof SetEditorBreakpointsMessage.method;

export interface EditorBreakpoint {
  line: number;
  verified: boolean;
}

export interface SetEditorBreakpointsParams {
  textDocument: TextDocumentIdentifier;
  breakpoints: EditorBreakpoint[];
}

export interface SetEditorBreakpointsResult {}

export class SetEditorBreakpointsMessage {
  static readonly method = "editor/setBreakpoints";
  static readonly type = new MessageProtocolRequestType<
    SetEditorBreakpointsMethod,
    SetEditorBreakpointsParams,
    SetEditorBreakpointsResult
  >(SetEditorBreakpointsMessage.method);
}

export namespace SetEditorBreakpointsMessage {
  export interface Request extends RequestMessage<
    SetEditorBreakpointsMethod,
    SetEditorBreakpointsParams,
    SetEditorBreakpointsResult
  > {}
  export type Response = ResponseMessage<
    SetEditorBreakpointsMethod,
    SetEditorBreakpointsResult
  >;
}

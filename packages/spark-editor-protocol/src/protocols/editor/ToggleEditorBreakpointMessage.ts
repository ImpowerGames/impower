import { TextDocumentIdentifier } from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ToggleEditorBreakpointMethod =
  typeof ToggleEditorBreakpointMessage.method;

export interface ToggleEditorBreakpointParams {
  textDocument: TextDocumentIdentifier;
}

export interface ToggleEditorBreakpointResult {
  line: number;
}

export class ToggleEditorBreakpointMessage {
  static readonly method = "editor/toggleBreakpoint";
  static readonly type = new MessageProtocolRequestType<
    ToggleEditorBreakpointMethod,
    ToggleEditorBreakpointParams,
    ToggleEditorBreakpointResult
  >(ToggleEditorBreakpointMessage.method);
}

export namespace ToggleEditorBreakpointMessage {
  export interface Request extends RequestMessage<
    ToggleEditorBreakpointMethod,
    ToggleEditorBreakpointParams,
    ToggleEditorBreakpointResult
  > {}
  export type Response = ResponseMessage<
    ToggleEditorBreakpointMethod,
    ToggleEditorBreakpointResult
  >;
}

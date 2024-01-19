import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorBreakpointsMethod =
  typeof ChangedEditorBreakpointsMessage.method;

export interface ChangedEditorBreakpointsParams {
  textDocument: TextDocumentIdentifier;
  breakpointRanges: Range[];
}

export class ChangedEditorBreakpointsMessage {
  static readonly method = "editor/breakpoints";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorBreakpointsMethod,
    ChangedEditorBreakpointsParams
  >(ChangedEditorBreakpointsMessage.method);
}

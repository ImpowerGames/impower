import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorBreakpointsMethod =
  typeof ChangedEditorBreakpointsMessage.method;

export interface ChangedEditorBreakpointsParams {
  textDocument: TextDocumentIdentifier;
  breakpointLines: number[];
}

export class ChangedEditorBreakpointsMessage {
  static readonly method = "editor/breakpointsChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorBreakpointsMethod,
    ChangedEditorBreakpointsParams
  >(ChangedEditorBreakpointsMessage.method);
}

export namespace ChangedEditorBreakpointsMessage {
  export interface Notification
    extends NotificationMessage<
      ChangedEditorBreakpointsMethod,
      ChangedEditorBreakpointsParams
    > {}
}

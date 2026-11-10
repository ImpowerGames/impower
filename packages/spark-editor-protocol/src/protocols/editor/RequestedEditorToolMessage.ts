import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type EditorTool =
  | "find"
  | "findNext"
  | "findPrevious"
  | "rename"
  | "references"
  | "problems";

export type RequestedEditorToolMethod = typeof RequestedEditorToolMessage.method;

export interface RequestedEditorToolParams {
  tool: EditorTool;
}

export class RequestedEditorToolMessage {
  static readonly method = "editor/requestedTool";
  static readonly type = new MessageProtocolNotificationType<
    RequestedEditorToolMethod,
    RequestedEditorToolParams
  >(RequestedEditorToolMessage.method);
}

export namespace RequestedEditorToolMessage {
  export interface Notification extends NotificationMessage<
    RequestedEditorToolMethod,
    RequestedEditorToolParams
  > {}
}

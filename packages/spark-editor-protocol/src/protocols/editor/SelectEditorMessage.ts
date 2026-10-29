import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectEditorMethod = typeof SelectEditorMessage.method;

export interface SelectEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  scrollIntoView?: "nearest" | "start" | "end" | "center" | false;
  takeFocus?: boolean;
}

export class SelectEditorMessage {
  static readonly method = "editor/select";
  static readonly type = new MessageProtocolNotificationType<
    SelectEditorMethod,
    SelectEditorParams
  >(SelectEditorMessage.method);
}

export namespace SelectEditorMessage {
  export interface Notification extends NotificationMessage<
    SelectEditorMethod,
    SelectEditorParams
  > {}
}

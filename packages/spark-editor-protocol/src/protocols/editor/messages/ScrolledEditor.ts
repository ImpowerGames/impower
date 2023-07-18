import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type ScrolledEditorMethod = typeof ScrolledEditor.type.method;

export interface ScrolledEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledEditorNotificationMessage
  extends NotificationMessage<ScrolledEditorMethod, ScrolledEditorParams> {}

class ScrolledEditorProtocolType extends NotificationProtocolType<
  ScrolledEditorNotificationMessage,
  ScrolledEditorParams
> {
  method = "editor/scrolled";
}

export abstract class ScrolledEditor {
  static readonly type = new ScrolledEditorProtocolType();
}

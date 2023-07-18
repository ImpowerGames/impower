import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type SelectedEditorMethod = typeof SelectedEditor.type.method;

export interface SelectedEditorParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedEditorNotificationMessage
  extends NotificationMessage<SelectedEditorMethod, SelectedEditorParams> {}

class SelectedEditorProtocolType extends NotificationProtocolType<
  SelectedEditorNotificationMessage,
  SelectedEditorParams
> {
  method = "editor/selected";
}

export abstract class SelectedEditor {
  static readonly type = new SelectedEditorProtocolType();
}

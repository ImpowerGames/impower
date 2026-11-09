import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorHistoryMethod =
  typeof ChangedEditorHistoryMessage.method;

export interface ChangedEditorHistoryParams {
  textDocument: TextDocumentIdentifier;
  canUndo: boolean;
  canRedo: boolean;
}

export class ChangedEditorHistoryMessage {
  static readonly method = "editor/historyChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorHistoryMethod,
    ChangedEditorHistoryParams
  >(ChangedEditorHistoryMessage.method);
}

export namespace ChangedEditorHistoryMessage {
  export interface Notification extends NotificationMessage<
    ChangedEditorHistoryMethod,
    ChangedEditorHistoryParams
  > {}
}

import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorStartingValueLinesMethod =
  typeof ChangedEditorStartingValueLinesMessage.method;

export interface ChangedEditorStartingValueLinesParams {
  textDocument: TextDocumentIdentifier;
  moves: [from: number, to: number | null][];
}

export class ChangedEditorStartingValueLinesMessage {
  static readonly method = "editor/startingValueLinesChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorStartingValueLinesMethod,
    ChangedEditorStartingValueLinesParams
  >(ChangedEditorStartingValueLinesMessage.method);
}

export namespace ChangedEditorStartingValueLinesMessage {
  export interface Notification extends NotificationMessage<
    ChangedEditorStartingValueLinesMethod,
    ChangedEditorStartingValueLinesParams
  > {}
}

import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorStartingValueLinesMethod =
  typeof ChangedEditorStartingValueLinesMessage.method;

/** An edit moved lines a starting value is kept on: each line it was on,
 *  counting from 0, and the line it is on now, or null for a line the edit
 *  deleted, whose values no longer resolve. */
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

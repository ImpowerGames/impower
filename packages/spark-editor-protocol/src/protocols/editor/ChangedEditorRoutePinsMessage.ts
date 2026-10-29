import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorRoutePinsMethod =
  typeof ChangedEditorRoutePinsMessage.method;

/** A pin of the document's, by its line, counting from 0, and its offer. */
export interface EditorRoutePin {
  line: number;
  offer: number;
}

/** An edit moved the document's pins to other lines, or deleted the line
 *  of one: every pin the document keeps. */
export interface ChangedEditorRoutePinsParams {
  textDocument: TextDocumentIdentifier;
  pins: EditorRoutePin[];
}

export class ChangedEditorRoutePinsMessage {
  static readonly method = "editor/routePinsChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorRoutePinsMethod,
    ChangedEditorRoutePinsParams
  >(ChangedEditorRoutePinsMessage.method);
}

export namespace ChangedEditorRoutePinsMessage {
  export interface Notification extends NotificationMessage<
    ChangedEditorRoutePinsMethod,
    ChangedEditorRoutePinsParams
  > {}
}

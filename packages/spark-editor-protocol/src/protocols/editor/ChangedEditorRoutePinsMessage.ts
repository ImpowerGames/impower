import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorRoutePinsMethod =
  typeof ChangedEditorRoutePinsMessage.method;

export interface EditorRoutePin {
  line: number;
  offer: number;
}

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

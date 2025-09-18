import { TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChangedEditorHighlightsMethod =
  typeof ChangedEditorHighlightsMessage.method;

export interface ChangedEditorHighlightsParams {
  textDocument: TextDocumentIdentifier;
  highlightLines: number[];
}

export class ChangedEditorHighlightsMessage {
  static readonly method = "editor/highlightsChanged";
  static readonly type = new MessageProtocolNotificationType<
    ChangedEditorHighlightsMethod,
    ChangedEditorHighlightsParams
  >(ChangedEditorHighlightsMessage.method);
}

export namespace ChangedEditorHighlightsMessage {
  export interface Notification
    extends NotificationMessage<
      ChangedEditorHighlightsMethod,
      ChangedEditorHighlightsParams
    > {}
}

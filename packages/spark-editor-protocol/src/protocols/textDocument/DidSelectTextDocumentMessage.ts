import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSelectTextDocumentMethod =
  typeof DidSelectTextDocumentMessage.method;

export interface DidSelectTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
}

export class DidSelectTextDocumentMessage {
  static readonly method = "textDocument/didSelect";
  static readonly type = new MessageProtocolNotificationType<
    DidSelectTextDocumentMethod,
    DidSelectTextDocumentParams
  >(DidSelectTextDocumentMessage.method);
}

export namespace DidSelectTextDocumentMessage {
  export interface Notification
    extends NotificationMessage<
      DidSelectTextDocumentMethod,
      DidSelectTextDocumentParams
    > {}
}

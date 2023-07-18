import { DidOpenTextDocumentParams, NotificationMessage } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidOpenTextDocumentMethod = typeof DidOpenTextDocument.type.method;

export interface DidOpenTextDocumentNotificationMessage
  extends NotificationMessage<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  > {}

class DidOpenTextDocumentProtocolType extends NotificationProtocolType<
  DidOpenTextDocumentNotificationMessage,
  DidOpenTextDocumentParams
> {
  method = "textDocument/didOpen";
}

export abstract class DidOpenTextDocument {
  static readonly type = new DidOpenTextDocumentProtocolType();
}

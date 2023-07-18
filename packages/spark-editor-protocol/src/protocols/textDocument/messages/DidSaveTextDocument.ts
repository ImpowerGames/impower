import { DidSaveTextDocumentParams, NotificationMessage } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidSaveTextDocumentMethod = typeof DidSaveTextDocument.type.method;

export interface DidSaveTextDocumentNotificationMessage
  extends NotificationMessage<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  > {}

class DidSaveTextDocumentProtocolType extends NotificationProtocolType<
  DidSaveTextDocumentNotificationMessage,
  DidSaveTextDocumentParams
> {
  method = "textDocument/didSave";
}

export abstract class DidSaveTextDocument {
  static readonly type = new DidSaveTextDocumentProtocolType();
}

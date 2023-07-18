import {
  DidChangeTextDocumentParams,
  NotificationMessage,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocument.type.method;

export interface DidChangeTextDocumentNotificationMessage
  extends NotificationMessage<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  > {}

class DidChangeTextDocumentProtocolType extends NotificationProtocolType<
  DidChangeTextDocumentNotificationMessage,
  DidChangeTextDocumentParams
> {
  method = "textDocument/didChange";
}

export abstract class DidChangeTextDocument {
  static readonly type = new DidChangeTextDocumentProtocolType();
}

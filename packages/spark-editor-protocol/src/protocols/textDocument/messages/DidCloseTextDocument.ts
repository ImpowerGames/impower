import {
  DidCloseTextDocumentParams,
  NotificationMessage,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocument.type.method;

export interface DidCloseTextDocumentNotificationMessage
  extends NotificationMessage<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  > {}

class DidCloseTextDocumentProtocolType extends NotificationProtocolType<
  DidCloseTextDocumentNotificationMessage,
  DidCloseTextDocumentParams
> {
  method = "textDocument/didClose";
}

export abstract class DidCloseTextDocument {
  static readonly type = new DidCloseTextDocumentProtocolType();
}

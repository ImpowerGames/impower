import { WillSaveTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillSaveTextDocumentMethod =
  typeof WillSaveTextDocumentMessage.method;

export class WillSaveTextDocumentMessage {
  static readonly method = "textDocument/willSave";
  static readonly type = new MessageProtocolNotificationType<
    WillSaveTextDocumentMethod,
    WillSaveTextDocumentParams
  >(WillSaveTextDocumentMessage.method);
}

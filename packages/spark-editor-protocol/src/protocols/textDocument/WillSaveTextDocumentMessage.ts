import { WillSaveTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillSaveTextDocumentMethod =
  typeof WillSaveTextDocumentMessage.method;

export namespace WillSaveTextDocumentMessage {
  export const method = "textDocument/willSave";
  export const type = new MessageProtocolNotificationType<
    WillSaveTextDocumentMethod,
    WillSaveTextDocumentParams
  >(WillSaveTextDocumentMessage.method);
}

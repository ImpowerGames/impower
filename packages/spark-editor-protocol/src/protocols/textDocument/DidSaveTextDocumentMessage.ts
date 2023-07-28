import { DidSaveTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSaveTextDocumentMethod =
  typeof DidSaveTextDocumentMessage.method;

export namespace DidSaveTextDocumentMessage {
  export const method = "textDocument/didSave";
  export const type = new MessageProtocolNotificationType<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  >(DidSaveTextDocumentMessage.method);
}

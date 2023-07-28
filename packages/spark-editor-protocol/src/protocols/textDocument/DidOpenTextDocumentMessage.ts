import { DidOpenTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenTextDocumentMethod =
  typeof DidOpenTextDocumentMessage.method;

export namespace DidOpenTextDocumentMessage {
  export const method = "textDocument/didOpen";
  export const type = new MessageProtocolNotificationType<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  >(DidOpenTextDocumentMessage.method);
}

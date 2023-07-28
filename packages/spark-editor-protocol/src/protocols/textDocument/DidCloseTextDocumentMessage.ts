import { DidCloseTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocumentMessage.method;

export namespace DidCloseTextDocumentMessage {
  export const method = "textDocument/didClose";
  export const type = new MessageProtocolNotificationType<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  >(DidCloseTextDocumentMessage.method);
}

import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadTextDocumentMethod = typeof ReadTextDocumentMessage.method;

export interface ReadTextDocumentParams {
  /**
   * The document that should be read.
   */
  textDocument: TextDocumentIdentifier;
}

export namespace ReadTextDocumentMessage {
  export const method = "textDocument/read";
  export const type = new MessageProtocolRequestType<
    ReadTextDocumentMethod,
    ReadTextDocumentParams,
    string
  >(ReadTextDocumentMessage.method);
}

import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WriteTextDocumentMethod = typeof WriteTextDocumentMessage.method;

export interface WriteTextDocumentParams {
  /**
   * The document that should be written.
   */
  textDocument: TextDocumentIdentifier;
  /**
   * The content to write.
   */
  text: string;
}

export namespace WriteTextDocumentMessage {
  export const method = "textDocument/write";
  export const type = new MessageProtocolRequestType<
    WriteTextDocumentMethod,
    WriteTextDocumentParams,
    null
  >(WriteTextDocumentMessage.method);
}

import { TextDocumentIdentifier } from "../../../types";
import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type WriteTextDocumentMethod = typeof WriteTextDocument.method;

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

export abstract class WriteTextDocument {
  static readonly method = "textDocument/write";
  static readonly type = new MessageProtocolRequestType<
    WriteTextDocumentMethod,
    WriteTextDocumentParams,
    null
  >(WriteTextDocument.method);
}

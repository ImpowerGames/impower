import { TextDocumentIdentifier } from "../../../types";
import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type ReadTextDocumentMethod = typeof ReadTextDocument.method;

export interface ReadTextDocumentParams {
  /**
   * The document that should be read.
   */
  textDocument: TextDocumentIdentifier;
}

export abstract class ReadTextDocument {
  static readonly method = "textDocument/read";
  static readonly type = new MessageProtocolRequestType<
    ReadTextDocumentMethod,
    ReadTextDocumentParams,
    string
  >(ReadTextDocument.method);
}

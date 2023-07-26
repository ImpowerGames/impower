import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ReadTextDocumentMethod = typeof ReadTextDocumentMessage.method;

export interface ReadTextDocumentParams {
  /**
   * The document that should be read.
   */
  textDocument: TextDocumentIdentifier;
}

export abstract class ReadTextDocumentMessage {
  static readonly method = "textDocument/read";
  static readonly type = new MessageProtocolRequestType<
    ReadTextDocumentMethod,
    ReadTextDocumentParams,
    string
  >(ReadTextDocumentMessage.method);
}

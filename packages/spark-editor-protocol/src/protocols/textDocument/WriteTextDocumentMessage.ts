import { TextDocumentIdentifier } from "vscode-languageserver-protocol";
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

export abstract class WriteTextDocumentMessage {
  static readonly method = "textDocument/write";
  static readonly type = new MessageProtocolRequestType<
    WriteTextDocumentMethod,
    WriteTextDocumentParams,
    null
  >(WriteTextDocumentMessage.method);
}

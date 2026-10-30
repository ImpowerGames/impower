import type { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import type { VersionedTextDocumentIdentifier } from "./VersionedTextDocumentIdentifier";

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

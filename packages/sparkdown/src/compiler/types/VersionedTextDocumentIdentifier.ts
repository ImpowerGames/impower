import { DocumentUri } from "vscode-languageserver-textdocument";

export interface VersionedTextDocumentIdentifier {
  uri: DocumentUri;
  version: number;
}

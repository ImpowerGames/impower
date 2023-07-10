import { DocumentUri } from "../base/DocumentUri";

export interface TextDocumentItem {
  uri: DocumentUri;
  languageId: string;
  version: number;
  text: string;
}

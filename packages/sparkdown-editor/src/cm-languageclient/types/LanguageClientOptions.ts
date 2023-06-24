import {
  DocumentSelector,
  InitializeParams,
} from "vscode-languageserver-protocol";

export interface LanguageClientOptions extends Partial<InitializeParams> {
  documentSelector?: DocumentSelector | string[];
}

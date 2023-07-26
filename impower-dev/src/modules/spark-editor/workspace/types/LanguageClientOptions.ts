import {
  DocumentSelector,
  InitializeParams,
} from "@impower/spark-editor-protocol/src/types";

export interface LanguageClientOptions extends Partial<InitializeParams> {
  documentSelector?: DocumentSelector | string[];
}

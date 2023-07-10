import { Range } from "./Range";

export interface TextDocumentContentChangeEvent {
  text: string;
  range?: Range;
}

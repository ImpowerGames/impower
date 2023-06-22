import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { SyntaxTree } from "./SyntaxTree";

export interface SyntaxTreeParser<T> {
  create: (text: string) => SyntaxTree;
  update: (
    tree: SyntaxTree,
    doc: T,
    changes: TextDocumentContentChangeEvent[],
    version: number
  ) => SyntaxTree;
}

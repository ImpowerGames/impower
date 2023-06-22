import { TextDocumentChangeEvent } from "vscode-languageserver";
import { SyntaxTree } from "./SyntaxTree";

export interface SyntaxTreeChangeEvent<T> extends TextDocumentChangeEvent<T> {
  tree: SyntaxTree;
}

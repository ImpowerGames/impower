import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { SyntaxTree } from "../types/SyntaxTree";
import { SyntaxTreeParser } from "../types/SyntaxTreeParser";

export default class SparkdownParser<T> implements SyntaxTreeParser<T> {
  create(text: string): SyntaxTree {
    console.log(text);
    return {};
  }

  update(
    tree: SyntaxTree,
    doc: T,
    changes: TextDocumentContentChangeEvent[],
    version: number
  ): SyntaxTree {
    console.log(tree, doc, changes, version);
    return {};
  }
}

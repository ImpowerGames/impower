import { Range, RangeSet } from "@codemirror/state";
import { Input, SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";
import { TextDocument } from "vscode-languageserver-textdocument";

export abstract class SparkdownAnnotator<
  T extends SparkdownAnnotation = SparkdownAnnotation
> {
  current: RangeSet<T> = RangeSet.empty;

  input?: Input;

  doc?: TextDocument;

  tree?: Tree;

  update(tree: Tree, input: Input, doc: TextDocument) {
    this.tree = tree;
    this.input = input;
    this.doc = doc;
    this.start();
  }

  start() {}

  remove(from: number, to: number, value: T) {}

  enter(annotations: Range<T>[], nodeRef: SyntaxNodeRef): Range<T>[] {
    return annotations;
  }

  leave(annotations: Range<T>[], nodeRef: SyntaxNodeRef): Range<T>[] {
    return annotations;
  }

  read(from: number, to: number) {
    if (!this.input) {
      return "";
    }
    return this.input.read(from, to);
  }
}

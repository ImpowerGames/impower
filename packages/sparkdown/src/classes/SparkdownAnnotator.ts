import { Range, RangeSet } from "@codemirror/state";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

export abstract class SparkdownAnnotator<
  T extends SparkdownAnnotation = SparkdownAnnotation
> {
  current: RangeSet<T> = RangeSet.empty;

  doc?: TextDocument;

  tree?: Tree;

  update(doc: TextDocument, tree: Tree) {
    this.doc = doc;
    this.tree = tree;
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
    if (!this.doc) {
      return "";
    }
    return this.doc.getText({
      start: this.doc.positionAt(from),
      end: this.doc.positionAt(to),
    });
  }
}

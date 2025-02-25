import { Range, RangeSet } from "@codemirror/state";
import { SyntaxNodeRef } from "@lezer/common";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

export abstract class SparkdownAnnotator<
  T extends SparkdownAnnotation = SparkdownAnnotation
> {
  current: RangeSet<T> = RangeSet.empty;

  doc?: TextDocument;

  update(doc: TextDocument) {
    this.doc = doc;
  }

  enter(
    annotations: Range<SparkdownAnnotation>[],
    _nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation>[] {
    return annotations;
  }

  leave(
    annotations: Range<SparkdownAnnotation>[],
    _nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation>[] {
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

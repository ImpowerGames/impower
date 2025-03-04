import { Line, Range, RangeSet, Text } from "@codemirror/state";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

export abstract class SparkdownAnnotator<
  T extends SparkdownAnnotation = SparkdownAnnotation
> {
  current: RangeSet<T> = RangeSet.empty;

  text?: Text;

  tree?: Tree;

  update(tree: Tree, text: Text) {
    this.tree = tree;
    this.text = text;
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
    if (!this.text) {
      return "";
    }
    return this.text?.sliceString(from, to);
  }

  readLine(pos: number) {
    if (!this.text) {
      return "";
    }
    const currentLine = this.text.lineAt(pos);
    if (currentLine.number >= this.text.lines) {
      return "";
    }
    return currentLine.text;
  }

  readNextLine(pos: number) {
    if (!this.text) {
      return "";
    }
    const currentLine = this.text.lineAt(pos);
    if (currentLine.number >= this.text.lines) {
      return "";
    }
    const nextLine = this.text.line(currentLine.number + 1);
    return nextLine.text;
  }

  getLineAt(pos: number) {
    if (!this.text) {
      return new Line();
    }
    return this.text.lineAt(pos);
  }
}

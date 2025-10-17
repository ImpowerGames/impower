import { Line, Range, RangeSet, Text } from "@codemirror/state";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

export abstract class SparkdownAnnotator<
  AnnotationType extends SparkdownAnnotation = SparkdownAnnotation,
  ConfigType extends Record<string, any> = {}
> {
  current: RangeSet<AnnotationType> = RangeSet.empty;

  config?: ConfigType;

  text?: Text;

  tree?: Tree;

  constructor(config?: ConfigType) {
    this.config = config;
  }

  update(tree: Tree, text: Text) {
    this.tree = tree;
    this.text = text;
  }

  begin(iterateFrom: number, iterateTo: number) {}

  end(iterateFrom: number, iterateTo: number) {}

  remove(from: number, to: number, value: AnnotationType) {}

  enter(
    annotations: Range<AnnotationType>[],
    nodeRef: SyntaxNodeRef,
    iteratingFrom: number,
    iteratingTo: number
  ): Range<AnnotationType>[] {
    return annotations;
  }

  leave(
    annotations: Range<AnnotationType>[],
    nodeRef: SyntaxNodeRef,
    iteratingFrom: number,
    iteratingTo: number
  ): Range<AnnotationType>[] {
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

  debug() {
    const iter = this.current.iter(0);
    while (iter.value) {
      console.log(
        iter.from,
        iter.to,
        JSON.stringify(this.read(iter.from, iter.to)),
        iter.value
      );
      iter.next();
    }
  }
}

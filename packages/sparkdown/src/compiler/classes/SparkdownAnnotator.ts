import { Line, Range, RangeSet, Text } from "@codemirror/state";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

const NON_WHITESPACE_REGEX = /\S/;

export abstract class SparkdownAnnotator<
  AnnotationType extends SparkdownAnnotation = SparkdownAnnotation,
  ConfigType extends Record<string, any> = {},
> {
  current: RangeSet<AnnotationType> = RangeSet.empty;

  config?: ConfigType;

  text?: Text;

  tree?: Tree;

  _annotationType!: AnnotationType;

  constructor(config?: ConfigType) {
    this.config = config;
  }

  update(tree: Tree, text: Text) {
    this.tree = tree;
    this.text = text;
  }

  begin(iterateFrom: number, iterateTo: number) {}

  end(
    iterateFrom: number,
    iterateTo: number,
    added: Range<AnnotationType>[],
    removed: Range<AnnotationType>[],
  ) {}

  remove(from: number, to: number, value: AnnotationType) {}

  enter(
    annotations: Range<AnnotationType>[],
    nodeRef: SyntaxNodeRef,
    iteratingFrom: number,
    iteratingTo: number,
  ): Range<AnnotationType>[] {
    return annotations;
  }

  leave(
    annotations: Range<AnnotationType>[],
    nodeRef: SyntaxNodeRef,
    iteratingFrom: number,
    iteratingTo: number,
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

  getNextNonWhitespacePos(pos: number): number {
    if (!this.text) {
      return 0;
    }

    // We iterate through the document starting from 'pos' to the end of the doc
    const iter = this.text.iterRange(pos);

    let currentPos = pos;

    while (!iter.done) {
      const chunk = iter.value;

      // Search for the first non-whitespace character in this chunk
      const match = chunk.search(NON_WHITESPACE_REGEX);

      if (match !== -1) {
        // If found, return the global document position
        return currentPos + match;
      }

      // Move our tracker forward by the length of the chunk we just checked
      currentPos += chunk.length;
      iter.next();
    }

    return this.text.length;
  }

  debug() {
    const iter = this.current.iter(0);
    while (iter.value) {
      console.log(
        iter.from,
        iter.to,
        JSON.stringify(this.read(iter.from, iter.to)),
        iter.value,
      );
      iter.next();
    }
  }
}

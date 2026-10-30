import { ChangeDesc, Line, Range, RangeSet, Text } from "@codemirror/state";
import { type SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

const NON_WHITESPACE_REGEX = /\S/;

export interface SparkdownAnnotatorSnapshot {
  current: RangeSet<any>;
  tree?: Tree;
  text?: Text;
  uri?: string;
}

export abstract class SparkdownAnnotator<
  AnnotationType extends SparkdownAnnotation = SparkdownAnnotation,
  ConfigType extends Record<string, any> = {},
> {
  current: RangeSet<AnnotationType> = RangeSet.empty;

  config?: ConfigType;

  text?: Text;

  tree?: Tree;

  uri?: string;

  _annotationType!: AnnotationType;

  constructor(config?: ConfigType) {
    this.config = config;
  }

  update(tree: Tree, text: Text, uri?: string) {
    this.tree = tree;
    this.text = text;
    if (uri !== undefined) this.uri = uri;
  }

  mapState(_changes: ChangeDesc) {}

  snapshot(): SparkdownAnnotatorSnapshot {
    return {
      current: this.current,
      tree: this.tree,
      text: this.text,
      uri: this.uri,
    };
  }

  restore(snapshot: SparkdownAnnotatorSnapshot) {
    this.current = snapshot.current as RangeSet<AnnotationType>;
    this.tree = snapshot.tree;
    this.text = snapshot.text;
    this.uri = snapshot.uri;
  }

  begin(_iterateFrom: number, _iterateTo: number) {}

  end(
    _iterateFrom: number,
    _iterateTo: number,
    _added: Range<AnnotationType>[],
    _removed: Range<AnnotationType>[],
  ) {}

  remove(_from: number, _to: number, _value: AnnotationType) {}

  enter(
    annotations: Range<AnnotationType>[],
    _nodeRef: SyntaxNodeRef,
    _iteratingFrom: number,
    _iteratingTo: number,
  ): Range<AnnotationType>[] {
    return annotations;
  }

  leave(
    annotations: Range<AnnotationType>[],
    _nodeRef: SyntaxNodeRef,
    _iteratingFrom: number,
    _iteratingTo: number,
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

    const iter = this.text.iterRange(pos);

    let currentPos = pos;

    while (!iter.done) {
      const chunk = iter.value;

      const match = chunk.search(NON_WHITESPACE_REGEX);

      if (match !== -1) {
        return currentPos + match;
      }

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

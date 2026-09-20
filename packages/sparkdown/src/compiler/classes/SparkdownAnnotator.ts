import { ChangeDesc, Line, Range, RangeSet, Text } from "@codemirror/state";
import { type SyntaxNodeRef, Tree } from "@lezer/common";
import { SparkdownAnnotation } from "./SparkdownAnnotation";

const NON_WHITESPACE_REGEX = /\S/;

/**
 * Everything an annotator carries from one update to the next.
 *
 * `current` is a `RangeSet`, a persistent value that an update replaces rather
 * than edits, so holding on to the old one costs a reference and leaves it
 * intact. An annotator that caches anything else across updates extends this
 * and covers that state in its own `snapshot`/`restore`.
 */
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

  /**
   * URI of the document currently being annotated. Wired in so the
   * `CompilationAnnotator` can stamp `filePath` onto `DebugMetadata`,
   * which lets inkjs's `ExportRuntime` diagnostics route back to the
   * right URI in `program.diagnostics`.
   */
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

  /**
   * Shift any position-keyed state this annotator caches across updates
   * through an edit. Called once per update, BEFORE the re-annotation window
   * is computed, so `begin` sees offsets in the new document.
   */
  mapState(_changes: ChangeDesc) {}

  /**
   * Everything this annotator carries across updates, to be handed back to
   * `restore` after a hypothetical edit this annotator has already seen.
   *
   * The default covers the base class's own fields. An annotator that caches
   * state beside its ranges overrides both halves, and a snapshot must survive
   * the update it is taken before: state an update replaces wholesale can be
   * held by reference, state an update mutates in place has to be copied.
   */
  snapshot(): SparkdownAnnotatorSnapshot {
    return {
      current: this.current,
      tree: this.tree,
      text: this.text,
      uri: this.uri,
    };
  }

  /** Take back the state `snapshot` recorded. */
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

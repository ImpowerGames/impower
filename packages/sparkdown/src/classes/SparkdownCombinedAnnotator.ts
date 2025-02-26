import { ChangeSpec, RangeSet, ChangeSet } from "@codemirror/state";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { Tree } from "@lezer/common";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CharacterAnnotator } from "./annotators/CharacterAnnotator";
import { SceneAnnotator } from "./annotators/SceneAnnotator";
import { TransitionAnnotator } from "./annotators/TransitionAnnotator";
import { ColorAnnotator } from "./annotators/ColorAnnotator";
import { DeclarationAnnotator } from "./annotators/DeclarationAnnotator";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export type SparkdownAnnotationRanges = {
  [K in keyof SparkdownAnnotators]: Writeable<
    NonNullable<
      Parameters<SparkdownAnnotators[K]["current"]["update"]>[0]["add"]
    >
  >;
};

export type SparkdownAnnotations = {
  [K in keyof SparkdownAnnotators]: SparkdownAnnotators[K]["current"];
};

export interface SparkdownAnnotators {
  colors: ColorAnnotator;
  characters: CharacterAnnotator;
  scenes: SceneAnnotator;
  transitions: TransitionAnnotator;
  declarations: DeclarationAnnotator;
}

export class SparkdownCombinedAnnotator {
  current: SparkdownAnnotators = {
    colors: new ColorAnnotator(),
    characters: new CharacterAnnotator(),
    scenes: new SceneAnnotator(),
    transitions: new TransitionAnnotator(),
    declarations: new DeclarationAnnotator(),
  };

  get(): SparkdownAnnotations {
    return {
      colors: this.current.colors.current,
      characters: this.current.characters.current,
      scenes: this.current.scenes.current,
      transitions: this.current.transitions.current,
      declarations: this.current.declarations.current,
    };
  }

  protected annotate(tree: Tree, from?: number, to?: number) {
    const annotatorEntries = Object.entries(this.current);
    const ranges: SparkdownAnnotationRanges = {
      colors: [],
      characters: [],
      scenes: [],
      transitions: [],
      declarations: [],
    };
    tree.iterate({
      from,
      to,
      enter: (nodeRef) => {
        for (const [key, annotator] of annotatorEntries) {
          annotator.enter(ranges[key as keyof SparkdownAnnotations]!, nodeRef);
        }
      },
      leave: (nodeRef) => {
        for (const [key, annotator] of annotatorEntries) {
          annotator.leave(ranges[key as keyof SparkdownAnnotations]!, nodeRef);
        }
      },
    });
    return ranges;
  }

  update(doc: TextDocument, tree: Tree, changes?: ChangeSpec[]) {
    const annotatorEntries = Object.entries(this.current);
    for (const [, annotator] of annotatorEntries) {
      annotator.update(doc, tree);
    }
    const cachedCompiler = tree.prop(cachedCompilerProp);
    const reparsedFrom = cachedCompiler?.reparsedFrom;
    const reparsedTo = cachedCompiler?.reparsedTo;
    if (!changes || reparsedFrom == null) {
      // Rebuild all annotations from scratch
      for (const [key, ranges] of Object.entries(this.annotate(tree))) {
        const annotator = this.current[key as keyof SparkdownAnnotations];
        if (annotator) {
          annotator.current =
            ranges.length > 0 ? RangeSet.of(ranges, true) : RangeSet.empty;
        }
      }
      return this.current;
    }
    const length = doc.offsetAt(doc.positionAt(Number.MAX_VALUE));
    const changeDesc = ChangeSet.of(changes, length).desc;
    if (reparsedTo == null) {
      // Only rebuild annotations after reparsedFrom
      for (const [key, add] of Object.entries(
        this.annotate(tree, reparsedFrom)
      )) {
        const annotator = this.current[key as keyof SparkdownAnnotations];
        if (annotator) {
          annotator.current = annotator.current.map(changeDesc);
          annotator.current = annotator.current.update({
            filter: (from, to) => from < reparsedFrom && to < reparsedFrom,
            add,
            sort: true,
          });
        }
      }
      return this.current;
    }
    // Only rebuild annotations between reparsedFrom and reparsedTo
    for (const [key, add] of Object.entries(
      this.annotate(tree, reparsedFrom, reparsedTo)
    )) {
      const annotator = this.current[key as keyof SparkdownAnnotations];
      if (annotator) {
        annotator.current = annotator.current.map(changeDesc);
        annotator.current = annotator.current.update({
          filter: (from, to) =>
            (from < reparsedFrom && to < reparsedFrom) ||
            (from > reparsedTo && to > reparsedTo),
          add,
          sort: true,
        });
      }
    }
    return this.current;
  }
}

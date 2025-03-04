import { ChangeSpec, RangeSet, ChangeSet, Text } from "@codemirror/state";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { Tree } from "@lezer/common";
import { CharacterAnnotator } from "./annotators/CharacterAnnotator";
import { SceneAnnotator } from "./annotators/SceneAnnotator";
import { TransitionAnnotator } from "./annotators/TransitionAnnotator";
import { ColorAnnotator } from "./annotators/ColorAnnotator";
import { DeclarationAnnotator } from "./annotators/DeclarationAnnotator";
import { SparkdownAnnotation } from "./SparkdownAnnotation";
import { TranspilationAnnotator } from "./annotators/TranspilationAnnotator";
import { ReferenceAnnotator } from "./annotators/ReferenceAnnotator";
import { ValidationAnnotator } from "./annotators/ValidationAnnotator";
import { ImplicitAnnotator } from "./annotators/ImplicitAnnotator";
import { SparkdownAnnotator } from "./SparkdownAnnotator";

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
  transpilations: TranspilationAnnotator;
  references: ReferenceAnnotator;
  validations: ValidationAnnotator;
  implicits: ImplicitAnnotator;
}

export class SparkdownCombinedAnnotator {
  current: SparkdownAnnotators = {
    colors: new ColorAnnotator(),
    characters: new CharacterAnnotator(),
    scenes: new SceneAnnotator(),
    transitions: new TransitionAnnotator(),
    declarations: new DeclarationAnnotator(),
    transpilations: new TranspilationAnnotator(),
    references: new ReferenceAnnotator(),
    validations: new ValidationAnnotator(),
    implicits: new ImplicitAnnotator(),
  };

  protected _currentEntries = Object.entries(this.current) as [
    string,
    SparkdownAnnotator
  ][];

  get(): SparkdownAnnotations {
    return {
      colors: this.current.colors.current,
      characters: this.current.characters.current,
      scenes: this.current.scenes.current,
      transitions: this.current.transitions.current,
      declarations: this.current.declarations.current,
      transpilations: this.current.transpilations.current,
      references: this.current.references.current,
      validations: this.current.validations.current,
      implicits: this.current.implicits.current,
    };
  }

  protected annotate(
    tree: Tree,
    from?: number,
    to?: number,
    skip?: Set<keyof SparkdownAnnotators>
  ) {
    const ranges: SparkdownAnnotationRanges = {
      colors: [],
      characters: [],
      scenes: [],
      transitions: [],
      declarations: [],
      transpilations: [],
      references: [],
      validations: [],
      implicits: [],
    };
    tree.iterate({
      from,
      to,
      enter: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!skip?.has(key as keyof SparkdownAnnotators)) {
            annotator.enter(ranges[key as keyof SparkdownAnnotators]!, nodeRef);
          }
        }
      },
      leave: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!skip?.has(key as keyof SparkdownAnnotators)) {
            annotator.leave(ranges[key as keyof SparkdownAnnotators]!, nodeRef);
          }
        }
      },
    });
    return ranges;
  }

  protected remove<T>(
    from: number,
    to: number,
    value: SparkdownAnnotation<T>,
    skip?: Set<keyof SparkdownAnnotators>
  ) {
    for (const [key, annotator] of this._currentEntries) {
      if (!skip?.has(key as keyof SparkdownAnnotators)) {
        annotator.remove(from, to, value);
      }
    }
  }

  create(tree: Tree, text: Text, skip?: Set<keyof SparkdownAnnotators>) {
    return this.update(tree, text, undefined, undefined, skip);
  }

  update(
    tree: Tree,
    text: Text,
    changes?: ChangeSpec[],
    length: number = 0,
    skip?: Set<keyof SparkdownAnnotators>
  ) {
    for (const [key, annotator] of this._currentEntries) {
      if (!skip?.has(key as keyof SparkdownAnnotators)) {
        annotator.update(tree, text);
      }
    }
    const cachedCompiler = tree.prop(cachedCompilerProp);
    const reparsedFrom = cachedCompiler?.reparsedFrom;
    const reparsedTo = cachedCompiler?.reparsedTo;
    if (!changes || reparsedFrom == null) {
      // Rebuild all annotations from scratch
      for (const [key, ranges] of Object.entries(
        this.annotate(tree, undefined, undefined, skip)
      )) {
        if (!skip?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current =
              ranges.length > 0 ? RangeSet.of(ranges, true) : RangeSet.empty;
          }
        }
      }
      return this.current;
    }
    const changeDesc = ChangeSet.of(
      changes,
      Math.max(tree.length, length)
    ).desc;
    if (reparsedTo == null) {
      // Only rebuild annotations after reparsedFrom
      for (const [key, add] of Object.entries(
        this.annotate(tree, reparsedFrom, undefined, skip)
      )) {
        if (!skip?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current = annotator.current.map(changeDesc);
            annotator.current = annotator.current.update({
              filter: (from, to, value) => {
                if (to <= reparsedFrom) {
                  return true;
                }
                this.remove(from, to, value, skip);
                return false;
              },
              add,
              sort: true,
            });
          }
        }
      }
      return this.current;
    }
    // Only rebuild annotations between reparsedFrom and reparsedTo
    for (const [key, add] of Object.entries(
      this.annotate(tree, reparsedFrom, reparsedTo, skip)
    )) {
      if (!skip?.has(key as keyof SparkdownAnnotators)) {
        const annotator = this.current[key as keyof SparkdownAnnotators];
        if (annotator) {
          annotator.current = annotator.current.map(changeDesc);
          annotator.current = annotator.current.update({
            filter: (from, to, value) => {
              if (to <= reparsedFrom || from >= reparsedTo) {
                return true;
              }
              this.remove(from, to, value, skip);
              return false;
            },
            add,
            sort: true,
          });
        }
      }
    }
    return this.current;
  }
}

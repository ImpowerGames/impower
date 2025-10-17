import { ChangeSet, ChangeSpec, RangeSet, Text } from "@codemirror/state";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { Tree } from "@lezer/common";
import { CharacterAnnotator } from "./annotators/CharacterAnnotator";
import { ColorAnnotator } from "./annotators/ColorAnnotator";
import { CompilationAnnotator } from "./annotators/CompilationAnnotator";
import { DeclarationAnnotator } from "./annotators/DeclarationAnnotator";
import { FormattingAnnotator } from "./annotators/FormattingAnnotator";
import { ImplicitAnnotator } from "./annotators/ImplicitAnnotator";
import { LinkAnnotator } from "./annotators/LinkAnnotator";
import { ReferenceAnnotator } from "./annotators/ReferenceAnnotator";
import { SemanticAnnotator } from "./annotators/SemanticAnnotator";
import { ValidationAnnotator } from "./annotators/ValidationAnnotator";
import { SparkdownAnnotation } from "./SparkdownAnnotation";
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

export type SparkdownAnnotatorConfigs = {
  [K in keyof SparkdownAnnotators]?: SparkdownAnnotators[K]["config"];
};

export interface SparkdownAnnotators {
  colors: ColorAnnotator;
  characters: CharacterAnnotator;
  declarations: DeclarationAnnotator;
  compilations: CompilationAnnotator;
  references: ReferenceAnnotator;
  validations: ValidationAnnotator;
  implicits: ImplicitAnnotator;
  formatting: FormattingAnnotator;
  links: LinkAnnotator;
  semantics: SemanticAnnotator;
}

export class SparkdownCombinedAnnotator {
  current: SparkdownAnnotators;

  protected _config?: SparkdownAnnotatorConfigs;

  protected _currentEntries: [string, SparkdownAnnotator][];

  constructor(config?: SparkdownAnnotatorConfigs) {
    this._config = config;
    this.current = {
      colors: new ColorAnnotator(),
      characters: new CharacterAnnotator(),
      declarations: new DeclarationAnnotator(),
      compilations: new CompilationAnnotator(config?.compilations),
      references: new ReferenceAnnotator(),
      validations: new ValidationAnnotator(),
      implicits: new ImplicitAnnotator(),
      formatting: new FormattingAnnotator(),
      links: new LinkAnnotator(),
      semantics: new SemanticAnnotator(),
    };
    this._currentEntries = Object.entries(this.current) as [
      string,
      SparkdownAnnotator
    ][];
  }

  get(): SparkdownAnnotations {
    return {
      colors: this.current.colors.current,
      characters: this.current.characters.current,
      declarations: this.current.declarations.current,
      compilations: this.current.compilations.current,
      references: this.current.references.current,
      validations: this.current.validations.current,
      implicits: this.current.implicits.current,
      formatting: this.current.formatting.current,
      links: this.current.links.current,
      semantics: this.current.semantics.current,
    };
  }

  protected annotate(
    tree: Tree,
    from?: number,
    to?: number,
    annotate?: Set<keyof SparkdownAnnotators>
  ) {
    const ranges: SparkdownAnnotationRanges = {
      colors: [],
      characters: [],
      declarations: [],
      compilations: [],
      references: [],
      validations: [],
      implicits: [],
      formatting: [],
      links: [],
      semantics: [],
    };

    const iteratingFrom = from ?? 0;
    const iteratingTo = to ?? tree.length;

    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.begin(iteratingFrom, iteratingTo);
      }
    }
    tree.iterate({
      from,
      to,
      enter: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
            annotator.enter(
              ranges[key as keyof SparkdownAnnotators]!,
              nodeRef,
              iteratingFrom,
              iteratingTo
            );
          }
        }
      },
      leave: (nodeRef) => {
        for (const [key, annotator] of this._currentEntries) {
          if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
            annotator.leave(
              ranges[key as keyof SparkdownAnnotators]!,
              nodeRef,
              iteratingFrom,
              iteratingTo
            );
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
    annotate?: Set<keyof SparkdownAnnotators>
  ) {
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.remove(from, to, value);
      }
    }
  }

  create(tree: Tree, text: Text, annotate?: Set<keyof SparkdownAnnotators>) {
    return this.update(tree, text, undefined, undefined, annotate);
  }

  update(
    tree: Tree,
    text: Text,
    changes?: ChangeSpec[],
    length: number = 0,
    annotate?: Set<keyof SparkdownAnnotators>
  ) {
    const cachedCompiler = tree.prop(cachedCompilerProp);
    const reparsedFrom = cachedCompiler?.reparsedFrom;
    const reparsedTo = cachedCompiler?.reparsedTo;
    const iteratingFrom = reparsedFrom ?? 0;
    const iteratingTo = reparsedTo ?? text.length;
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.update(tree, text);
      }
    }
    if (!changes || reparsedFrom == null) {
      // Rebuild all annotations from scratch
      for (const [key, ranges] of Object.entries(
        this.annotate(tree, undefined, undefined, annotate)
      )) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current =
              ranges.length > 0 ? RangeSet.of(ranges, true) : RangeSet.empty;
          }
        }
      }
      for (const [key, annotator] of this._currentEntries) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          annotator.end(iteratingFrom, iteratingTo);
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
        this.annotate(tree, reparsedFrom, undefined, annotate)
      )) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current = annotator.current.map(changeDesc);
            annotator.current = annotator.current.update({
              filter: (from, to, value) => {
                if (to < reparsedFrom) {
                  return true;
                }
                this.remove(from, to, value, annotate);
                return false;
              },
              add,
              sort: true,
            });
          }
        }
      }
      for (const [key, annotator] of this._currentEntries) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          annotator.end(iteratingFrom, iteratingTo);
        }
      }
      return this.current;
    }
    // Only rebuild annotations between reparsedFrom and reparsedTo
    for (const [key, add] of Object.entries(
      this.annotate(tree, reparsedFrom, reparsedTo, annotate)
    )) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        const annotator = this.current[key as keyof SparkdownAnnotators];
        if (annotator) {
          annotator.current = annotator.current.map(changeDesc);
          annotator.current = annotator.current.update({
            filter: (from, to, value) => {
              if (to < reparsedFrom || from > reparsedTo) {
                return true;
              }
              this.remove(from, to, value, annotate);
              return false;
            },
            add,
            sort: true,
          });
        }
      }
    }
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.end(iteratingFrom, iteratingTo);
      }
    }
    return this.current;
  }
}

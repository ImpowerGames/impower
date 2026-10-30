import { isExplicitRuleName } from "../utils/explicitRuleNames";
import { ALTERNATOR_CANDIDATES } from "../utils/alternatorDecision";
import { nodeNameSet } from "../utils/nodeNameSet";
import { documentString } from "../utils/documentString";
import {
  ChangeDesc,
  ChangeSet,
  type ChangeSpec,
  Range,
  RangeSet,
  Text,
} from "@codemirror/state";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { type SyntaxNode, Tree } from "@lezer/common";
import { nextSignificantToken } from "../lower/utils/validateAssignmentValue";
import {
  assignmentListName,
  VARIABLE_DEFINITION_CONTENT_NAMES,
} from "../utils/variableDefinitionNames";
import {
  DefineTypeNameIndex,
  type DefineTypeNameIndexSnapshot,
} from "./DefineTypeNameIndex";
import { CharacterAnnotator } from "./annotators/CharacterAnnotator";
import { ColorAnnotator } from "./annotators/ColorAnnotator";
import { CompilationAnnotator } from "./annotators/CompilationAnnotator";
import { DeclarationAnnotator } from "./annotators/DeclarationAnnotator";
import { FormattingAnnotator } from "./annotators/FormattingAnnotator";
import { ImplicitAnnotator } from "./annotators/ImplicitAnnotator";
import { LensAnnotator } from "./annotators/LensAnnotator";
import { LinkAnnotator } from "./annotators/LinkAnnotator";
import { ReferenceAnnotator } from "./annotators/ReferenceAnnotator";
import { SemanticAnnotator } from "./annotators/SemanticAnnotator";
import { ValidationAnnotator } from "./annotators/ValidationAnnotator";
import { SparkdownAnnotation } from "./SparkdownAnnotation";
import {
  SparkdownAnnotator,
  type SparkdownAnnotatorSnapshot,
} from "./SparkdownAnnotator";

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

let uncomparableCounter = 0;
function annotationValueKey(value: SparkdownAnnotation<any>): string {
  const type = value?.type;
  if (type == null || typeof type !== "object") {
    return `p:${String(type)}`;
  }
  try {
    const key = JSON.stringify(type);
    if (key !== undefined) {
      return `o:${key}`;
    }
  } catch {
  }
  uncomparableCounter += 1;
  return `!:${uncomparableCounter}`;
}

const DELIMITED_VALUE_NAMES = nodeNameSet([
  "LuauTable",
  "LuauFunctionDefinition",
  "LuauFunctionBody",
  "LuauParenthetical",
  "LuauFunctionCallParameters",
]);

function listNameEnd(child: SyntaxNode): number | null {
  if (isExplicitRuleName(child.name, "LuauAccessPath")) return child.to;
  return assignmentListName(child)?.to ?? null;
}

const ENDS_GOING_ON =
  /(?:(?<![A-Za-z0-9_])(?:then|else|elseif|and|or|not|in|return)|[=,(\[{+\-*\/%^#:<>.])$/;

const BEGINS_GOING_ON = /^\s*(?:["'`{(\[.:]|(?:and|or)\b|[+\-*\/%^<>=~])/;

function extendToValueListEnd(
  tree: Tree,
  from: number,
  to: number | undefined,
): number | undefined {
  if (to == null) return to;
  let end = to;
  let insideValue = false;
  for (
    let node: SyntaxNode | null = tree.resolveInner(to, -1);
    node;
    node = node.parent
  ) {
    if (DELIMITED_VALUE_NAMES.has(node.name) && node.from < from && node.to > to) {
      insideValue = true;
    }
    if (
      insideValue ||
      !VARIABLE_DEFINITION_CONTENT_NAMES.has(node.name) ||
      node.from >= to
    ) {
      continue;
    }
    for (
      let child = node.lastChild;
      child && child.to > end;
      child = child.prevSibling
    ) {
      const nameEnd = listNameEnd(child);
      if (nameEnd != null) {
        end = Math.max(end, nameEnd);
        break;
      }
    }
  }
  return end;
}

function extendToAlternatorWord(tree: Tree, from: number): number {
  let start = from;
  for (
    let node: SyntaxNode | null = tree.resolveInner(from, -1);
    node;
    node = node.parent
  ) {
    if (ALTERNATOR_CANDIDATES.has(node.name) && node.from < start) {
      start = node.from;
    }
  }
  return start;
}

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
  lenses: LensAnnotator;
  semantics: SemanticAnnotator;
}

export interface SparkdownCombinedAnnotatorSnapshot {
  annotators: Map<string, SparkdownAnnotatorSnapshot>;
  defineTypeNames: DefineTypeNameIndexSnapshot;
}

export class SparkdownCombinedAnnotator {
  current: SparkdownAnnotators;

  protected _config?: SparkdownAnnotatorConfigs;

  protected _currentEntries: [string, SparkdownAnnotator][];

  protected _defineTypeNames = new DefineTypeNameIndex();
  get defineTypeNames(): ReadonlySet<string> | undefined {
    return this._defineTypeNames.names;
  }

  protected runsCompilations(annotate?: Set<keyof SparkdownAnnotators>): boolean {
    return !annotate || annotate.has("compilations");
  }

  constructor(config?: SparkdownAnnotatorConfigs) {
    this._config = config;
    this.current = {
      colors: new ColorAnnotator(),
      characters: new CharacterAnnotator(),
      declarations: new DeclarationAnnotator(),
      compilations: new CompilationAnnotator(
        config?.compilations,
        this._defineTypeNames,
      ),
      references: new ReferenceAnnotator(),
      validations: new ValidationAnnotator(),
      implicits: new ImplicitAnnotator(),
      formatting: new FormattingAnnotator(),
      links: new LinkAnnotator(),
      lenses: new LensAnnotator(),
      semantics: new SemanticAnnotator(),
    };
    this._currentEntries = Object.entries(this.current) as [
      string,
      SparkdownAnnotator,
    ][];
  }

  snapshot(
    annotate?: Set<keyof SparkdownAnnotators>,
  ): SparkdownCombinedAnnotatorSnapshot {
    const annotators = new Map<string, SparkdownAnnotatorSnapshot>();
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate.has(key as keyof SparkdownAnnotators)) {
        annotators.set(key, annotator.snapshot());
      }
    }
    return {
      annotators,
      defineTypeNames: this._defineTypeNames.snapshot(),
    };
  }

  restore(snapshot: SparkdownCombinedAnnotatorSnapshot) {
    for (const [key, annotator] of this._currentEntries) {
      const saved = snapshot.annotators.get(key);
      if (saved) {
        annotator.restore(saved);
      }
    }
    this._defineTypeNames.restore(snapshot.defineTypeNames);
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
      lenses: this.current.lenses.current,
      semantics: this.current.semantics.current,
    };
  }

  protected annotate(
    tree: Tree,
    from?: number,
    to?: number,
    annotate?: Set<keyof SparkdownAnnotators>,
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
      lenses: [],
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
              iteratingTo,
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
              iteratingTo,
            );
          }
        }
      },
    });
    return ranges;
  }

  protected pruneRedundant<T extends SparkdownAnnotation<any>>(
    add: Range<T>[],
    current: RangeSet<T>,
    windowFrom: number,
    windowTo: number,
  ): Range<T>[] {
    let redundant: Set<number> | undefined;
    let prunedSoFar: Map<string, number> | undefined;
    for (let i = 0; i < add.length; i++) {
      const candidate = add[i]!;
      if (candidate.to >= windowFrom && candidate.from <= windowTo) {
        continue;
      }
      const valueKey = annotationValueKey(candidate.value);
      let survivors = 0;
      current.between(candidate.from, candidate.to, (from, to, value) => {
        if (
          from === candidate.from &&
          to === candidate.to &&
          annotationValueKey(value) === valueKey
        ) {
          survivors += 1;
        }
        return undefined;
      });
      if (survivors === 0) {
        continue;
      }
      const key = `${candidate.from}:${candidate.to}:${valueKey}`;
      prunedSoFar ??= new Map();
      const alreadyPruned = prunedSoFar.get(key) ?? 0;
      if (alreadyPruned < survivors) {
        prunedSoFar.set(key, alreadyPruned + 1);
        (redundant ??= new Set()).add(i);
      }
    }
    if (!redundant) {
      return add;
    }
    return add.filter((_, i) => !redundant!.has(i));
  }

  protected remove<T>(
    from: number,
    to: number,
    value: SparkdownAnnotation<T>,
    annotate?: Set<keyof SparkdownAnnotators>,
  ) {
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.remove(from, to, value);
      }
    }
  }

  create(
    tree: Tree,
    text: Text,
    annotate?: Set<keyof SparkdownAnnotators>,
    uri?: string,
  ) {
    return this.update(tree, text, undefined, undefined, annotate, uri);
  }

  update(
    tree: Tree,
    text: Text,
    changes?: ChangeSpec[],
    length: number = 0,
    annotate?: Set<keyof SparkdownAnnotators>,
    uri?: string,
  ) {
    const cachedCompiler = tree.prop(cachedCompilerProp);
    const reparsedFrom = cachedCompiler?.reparsedFrom;
    const reparsedTo = cachedCompiler?.reparsedTo;
    const iteratingFrom = reparsedFrom ?? 0;
    const iteratingTo = reparsedTo ?? text.length;
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.update(tree, text, uri);
      }
    }
    const runsCompilations = this.runsCompilations(annotate);
    if (!changes || reparsedFrom == null) {
      if (runsCompilations) {
        this._defineTypeNames.rebuild(tree, text);
      } else {
        this._defineTypeNames.invalidate();
      }
      this.current.compilations.rebuilt = { from: 0, to: text.length };
      const rebuiltAll = this.annotate(tree, undefined, undefined, annotate);
      this.current.compilations.settle();
      for (const [key, add] of Object.entries(rebuiltAll)) {
        if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
          const annotator = this.current[key as keyof SparkdownAnnotators];
          if (annotator) {
            annotator.current =
              add.length > 0 ? RangeSet.of(add, true) : RangeSet.empty;
            annotator.end(iteratingFrom, iteratingTo, add as any, []);
          }
        }
      }
      if (runsCompilations) {
        this.current.compilations.markDocumentNamesChecked();
      }
      return this.current;
    }
    const changeDesc = ChangeSet.of(
      changes,
      Math.max(tree.length, length),
    ).desc;
    let editStart = reparsedFrom;
    changeDesc.iterChangedRanges((_fromA, _toA, fromB) => {
      if (fromB < editStart) {
        editStart = fromB;
      }
    });
    editStart = extendToAlternatorWord(tree, editStart);
    if (runsCompilations) {
      this._defineTypeNames.update(
        tree,
        text,
        changeDesc,
        editStart,
        reparsedTo ?? text.length,
      );
    } else {
      this._defineTypeNames.invalidate();
    }
    for (const [key, annotator] of this._currentEntries) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        annotator.mapState(changeDesc);
      }
    }
    const windowTo = extendToValueListEnd(
      tree,
      editStart,
      reparsedTo ?? undefined,
    );
    if (runsCompilations) {
      this.current.compilations.rebuilt = {
        from: editStart,
        to: windowTo ?? text.length,
      };
    }
    this.reannotate(
      tree,
      editStart,
      windowTo,
      iteratingFrom,
      iteratingTo,
      annotate,
      changeDesc,
    );
    this.current.compilations.settle();
    if (!annotate || annotate.has("validations")) {
      const wide = this.validationWindow(tree, text, editStart, windowTo);
      if (
        wide.from < editStart ||
        (windowTo != null && (wide.to == null || wide.to > windowTo))
      ) {
        this.reannotate(
          tree,
          wide.from,
          wide.to,
          iteratingFrom,
          iteratingTo,
          new Set<keyof SparkdownAnnotators>(["validations"]),
          undefined,
          wide.from > 0 ? text.lineAt(wide.from - 1).from : 0,
        );
      }
    }
    if (runsCompilations) {
      this.relowerStaleCompilations(tree);
    }
    return this.current;
  }

  protected validationWindow(
    tree: Tree,
    text: Text,
    from: number,
    to: number | undefined,
  ): { from: number; to: number | undefined } {
    const read = (a: number, b: number) =>
      text.sliceString(a, Math.min(b, text.length));
    const document = () => documentString(text);
    type Line = ReturnType<Text["line"]>;
    const isCode = (line: Line) => !this.holdsOnlyTrivia(tree, line, read, document);
    const previousCode = (line: Line): Line | null => {
      for (let n = line.number - 1; n >= 1; n--) {
        const candidate = text.line(n);
        if (isCode(candidate)) return candidate;
      }
      return null;
    };
    const nextCode = (line: Line): Line | null => {
      for (let n = line.number + 1; n <= text.lines; n++) {
        const candidate = text.line(n);
        if (isCode(candidate)) return candidate;
      }
      return null;
    };
    const goesOn = (line: Line, into: Line) =>
      ENDS_GOING_ON.test(this.codeOf(tree, line)) ||
      BEGINS_GOING_ON.test(into.text);

    const editLine = text.lineAt(from);
    let start = previousCode(editLine);
    const owner = start ? previousCode(start) : null;
    if (owner) {
      start = owner;
      for (let p = previousCode(start); p && goesOn(p, start); p = previousCode(p)) {
        start = p;
      }
    }
    const windowFrom = start?.from ?? 0;
    if (to == null) {
      return { from: windowFrom, to };
    }
    const next = nextSignificantToken(tree.topNode, text.lineAt(to).to, read, document);
    if (!next) {
      return { from: windowFrom, to: text.length };
    }
    let end = text.lineAt(next.from);
    let before = previousCode(end);
    while (before && goesOn(before, end)) {
      const after = nextCode(end);
      if (!after) break;
      before = end;
      end = after;
    }
    return { from: windowFrom, to: end.to };
  }

  protected codeOf(tree: Tree, line: { from: number; to: number; text: string }): string {
    let comment: SyntaxNode | null = tree.resolveInner(line.to, -1);
    while (comment && !comment.name.endsWith("Comment")) {
      comment = comment.parent;
    }
    const cut = comment && comment.from >= line.from ? comment.from - line.from : line.text.length;
    return line.text.slice(0, cut).trimEnd();
  }

  protected holdsOnlyTrivia(
    tree: Tree,
    line: { from: number; to: number; text: string },
    read: (from: number, to: number) => string,
    document: () => string,
  ): boolean {
    const indent = line.text.length - line.text.trimStart().length;
    if (indent === line.text.length) {
      return true;
    }
    let comment: SyntaxNode | null = tree.resolveInner(line.from + indent, 1);
    while (comment && !comment.name.endsWith("Comment")) {
      comment = comment.parent;
    }
    if (!comment) {
      return false;
    }
    const next = nextSignificantToken(tree.topNode, comment.to, read, document);
    return next == null || next.from > line.to;
  }

  relowerCompilations(tree: Tree, ranges: readonly { from: number; to: number }[]) {
    const compilationsOnly = new Set<keyof SparkdownAnnotators>([
      "compilations",
    ]);
    this.current.compilations.settle(true);
    for (const { from, to } of ranges) {
      this.reannotate(tree, from, to, from, to, compilationsOnly);
    }
  }

  protected relowerStaleCompilations(tree: Tree) {
    const compilations = this.current.compilations;
    const compilationsOnly = new Set<keyof SparkdownAnnotators>([
      "compilations",
    ]);
    for (const { from, to } of compilations.staleRanges()) {
      this.reannotate(tree, from, to, from, to, compilationsOnly);
    }
    compilations.markDocumentNamesChecked();
  }

  protected reannotate(
    tree: Tree,
    windowFrom: number,
    windowTo: number | undefined,
    iteratingFrom: number,
    iteratingTo: number,
    annotate?: Set<keyof SparkdownAnnotators>,
    changes?: ChangeDesc,
    walkFrom: number = windowFrom,
  ) {
    const filterTo = windowTo ?? Infinity;
    for (const [key, add] of Object.entries(
      this.annotate(tree, walkFrom, windowTo, annotate),
    )) {
      if (!annotate || annotate?.has(key as keyof SparkdownAnnotators)) {
        const annotator: SparkdownAnnotator<SparkdownAnnotation<any>> =
          this.current[key as keyof SparkdownAnnotators];
        if (annotator) {
          const removed: Range<SparkdownAnnotation<any>>[] = [];
          if (changes) {
            annotator.current = annotator.current.map(changes);
          }
          const kept = this.pruneRedundant(
            add as any,
            annotator.current,
            windowFrom,
            filterTo,
          );
          annotator.current = annotator.current.update({
            filter: (from, to, value) => {
              if (to < windowFrom || from > filterTo) {
                return true;
              }
              removed.push(value.range(from, to));
              this.remove(from, to, value, annotate);
              return false;
            },
            add: kept,
            sort: true,
          });
          annotator.end(
            iteratingFrom,
            iteratingTo,
            kept as any,
            removed as any,
          );
        }
      }
    }
  }
}

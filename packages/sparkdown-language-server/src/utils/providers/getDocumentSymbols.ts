import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type Tree } from "@lezer/common";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { Position, Range } from "vscode-languageserver-textdocument";
import {
  getDeclarationHeadings,
  type DeclarationHeading,
} from "../annotations/getDeclarationHeadings";

export const isRangeContained = (outer: Range, inner: Range): boolean => {
  const isAfterOrSame = (pos1: Position, pos2: Position): boolean =>
    pos1.line > pos2.line ||
    (pos1.line === pos2.line && pos1.character >= pos2.character);

  const isBeforeOrSame = (pos1: Position, pos2: Position): boolean =>
    pos1.line < pos2.line ||
    (pos1.line === pos2.line && pos1.character <= pos2.character);

  return (
    isAfterOrSame(inner.start, outer.start) &&
    isBeforeOrSame(inner.end, outer.end)
  );
};

const SYMBOL_KINDS: Record<DeclarationHeading["type"], SymbolKind> = {
  scene: SymbolKind.Class,
  branch: SymbolKind.Interface,
  function: SymbolKind.Function,
  label: SymbolKind.EnumMember,
};

const toSymbol = (heading: DeclarationHeading): DocumentSymbol => {
  const { nameRange } = heading;
  // A label is just its name; a scene, branch or function spans from the
  // start of its declaration line to where its extent ends.
  const selectionRange =
    heading.type === "label"
      ? nameRange
      : {
          start: { line: nameRange.start.line, character: 0 },
          end: nameRange.end,
        };
  const symbol: DocumentSymbol = {
    name: heading.name,
    kind: SYMBOL_KINDS[heading.type],
    range:
      heading.type === "label"
        ? structuredClone(nameRange)
        : { start: structuredClone(selectionRange.start), end: heading.end },
    selectionRange,
  };
  if (heading.children.length) {
    symbol.children = heading.children.map(toSymbol);
  }
  return symbol;
};

export const getDocumentSymbols = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  tree: Tree | undefined,
): DocumentSymbol[] => {
  if (!document || !annotations) {
    return [];
  }
  return getDeclarationHeadings(document, annotations, tree)
    .map(toSymbol)
    .filter(
      (s) =>
        Boolean(s.name) && Boolean(isRangeContained(s.range, s.selectionRange)),
    );
};

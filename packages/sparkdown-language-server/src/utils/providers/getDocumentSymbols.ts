import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type Tree } from "@lezer/common";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { Position, Range } from "vscode-languageserver-textdocument";
import { getChoiceMenus, type ChoiceMenu } from "../annotations/getChoiceMenus";
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

const comparePositions = (a: Position, b: Position) =>
  a.line - b.line || a.character - b.character;

const menuSymbol = (menu: ChoiceMenu): DocumentSymbol => ({
  name: menu.name,
  kind: SymbolKind.Enum,
  range: menu.range,
  selectionRange: menu.selectionRange,
  children: menu.options.map((option) => ({
    name: option.name,
    kind: SymbolKind.EnumMember,
    range: option.range,
    selectionRange: option.selectionRange,
  })),
});

const placeMenu = (symbols: DocumentSymbol[], menu: DocumentSymbol) => {
  let siblings = symbols;
  for (;;) {
    const parent = siblings.find(
      (s) =>
        s.kind !== SymbolKind.EnumMember &&
        isRangeContained(s.range, menu.range),
    );
    if (!parent) {
      break;
    }
    parent.children ??= [];
    siblings = parent.children;
  }
  const index = siblings.findIndex(
    (s) => comparePositions(s.range.start, menu.range.start) > 0,
  );
  siblings.splice(index < 0 ? siblings.length : index, 0, menu);
};

export const getDocumentSymbols = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  tree: Tree | undefined,
): DocumentSymbol[] => {
  if (!document || !annotations) {
    return [];
  }
  const symbols = getDeclarationHeadings(document, annotations, tree).map(
    toSymbol,
  );
  for (const menu of getChoiceMenus(document, tree)) {
    placeMenu(symbols, menuSymbol(menu));
  }
  return symbols.filter(
    (s) =>
      Boolean(s.name) && Boolean(isRangeContained(s.range, s.selectionRange)),
  );
};

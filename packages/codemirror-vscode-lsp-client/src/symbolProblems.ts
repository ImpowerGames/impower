import type * as lsp from "vscode-languageserver-protocol";

export interface ProblemCounts {
  errors: number;
  warnings: number;
}

export interface SymbolProblems {
  total: ProblemCounts;
  direct: ProblemCounts;
}

const ERROR = 1;
const WARNING = 2;
const CLASS = 5;
const ENUM = 10;
const INTERFACE = 11;
const FUNCTION = 12;
const NESTED_SCOPE_KINDS: ReadonlySet<lsp.SymbolKind> = new Set([
  CLASS,
  ENUM,
  INTERFACE,
  FUNCTION,
]);

const isWithin = (position: lsp.Position, range: lsp.Range) =>
  (position.line > range.start.line ||
    (position.line === range.start.line &&
      position.character >= range.start.character)) &&
  (position.line < range.end.line ||
    (position.line === range.end.line &&
      position.character <= range.end.character));

export const countProblems = (
  diagnostics: readonly lsp.Diagnostic[],
): ProblemCounts => ({
  errors: diagnostics.filter((d) => (d.severity ?? ERROR) === ERROR).length,
  warnings: diagnostics.filter((d) => d.severity === WARNING).length,
});

export const hasProblems = (counts: ProblemCounts) =>
  counts.errors > 0 || counts.warnings > 0;

export function countSymbolProblems(
  symbols: readonly lsp.DocumentSymbol[],
  diagnostics: readonly lsp.Diagnostic[],
): Map<lsp.DocumentSymbol, SymbolProblems> {
  const result = new Map<lsp.DocumentSymbol, SymbolProblems>();
  const visit = (
    symbol: lsp.DocumentSymbol,
    candidates: readonly lsp.Diagnostic[],
  ): readonly lsp.Diagnostic[] => {
    const inside = candidates.filter((d) =>
      isWithin(d.range.start, symbol.range),
    );
    const nested = new Set<lsp.Diagnostic>();
    for (const child of symbol.children ?? []) {
      const owned = visit(child, inside);
      if (NESTED_SCOPE_KINDS.has(child.kind)) {
        owned.forEach((d) => nested.add(d));
      }
    }
    result.set(symbol, {
      total: countProblems(inside),
      direct: countProblems(inside.filter((d) => !nested.has(d))),
    });
    return inside;
  };
  symbols.forEach((symbol) => visit(symbol, diagnostics));
  return result;
}

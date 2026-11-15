import type * as lsp from "vscode-languageserver-protocol";

export interface ProblemCounts {
  errors: number;
  warnings: number;
  notes: number;
}

const ERROR = 1;
const WARNING = 2;
const INFORMATION = 3;
const HINT = 4;
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
  notes: diagnostics.filter(
    (d) => d.severity === INFORMATION || d.severity === HINT,
  ).length,
});

export const worstProblem = (
  counts: ProblemCounts,
): "error" | "warning" | "note" | null =>
  counts.errors > 0
    ? "error"
    : counts.warnings > 0
      ? "warning"
      : counts.notes > 0
        ? "note"
        : null;

export interface SymbolDiagnostics {
  total: readonly lsp.Diagnostic[];
  direct: readonly lsp.Diagnostic[];
}

export function collectSymbolDiagnostics(
  symbols: readonly lsp.DocumentSymbol[],
  diagnostics: readonly lsp.Diagnostic[],
): Map<lsp.DocumentSymbol, SymbolDiagnostics> {
  const result = new Map<lsp.DocumentSymbol, SymbolDiagnostics>();
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
      total: inside,
      direct: inside.filter((d) => !nested.has(d)),
    });
    return inside;
  };
  symbols.forEach((symbol) => visit(symbol, diagnostics));
  return result;
}

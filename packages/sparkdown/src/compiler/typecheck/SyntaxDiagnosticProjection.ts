import type { SyntaxNode, Tree } from "@lezer/common";

export interface SyntaxPosition { line: number; character: number }
export interface SyntaxRange { start: SyntaxPosition; end: SyntaxPosition }
export interface ProjectedSyntaxDiagnostic extends SyntaxRange {
  code: "SyntaxError";
  message: string;
  syntax: true;
}
export interface ParserSyntaxDiagnostic {
  location: { begin: { line: number; column: number }; end: { line: number; column: number } };
  message: string;
  malformed: boolean;
}

// Pure presentation policy extracted from SparkdownTypechecker.report. It has
// no checker/frontend dependency, and never changes the parser's raw errors.
export function createSyntaxDiagnosticProjection(text: string, tree: Tree) {
  let lineStarts: number[] | undefined;
  const lineStartsOf = () => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
    }
    return lineStarts;
  };
  const isSparkdownSyntax = (position: SyntaxPosition) => {
    const offset = (lineStartsOf()[position.line] ?? text.length) + position.character - 1;
    for (let node: SyntaxNode | null = tree.resolveInner(Math.max(offset, 0), 1); node; node = node.parent) {
      if (node.name === "LuauLabel") return true;
    }
    return false;
  };
  const rangeEnd = (start: SyntaxPosition, end: SyntaxPosition, atEnd: boolean, missingType: boolean) => {
    if (missingType && (end.line > start.line + 1 || (end.line === start.line + 1 && end.character > 0))) {
      return start.line + 1 < lineStartsOf().length ? { line: start.line + 1, character: 0 } : end;
    }
    const after = end.line > start.line || (end.line === start.line && end.character > start.character);
    if (after && (!atEnd || end.character === 0)) return end;
    const line = after ? end.line : start.line;
    return line + 1 < lineStartsOf().length ? { line: line + 1, character: 0 } : after ? end : start;
  };
  // Each original unit has its own recovery-token ownership set; document
  // indexing is shared by all units to preserve the reporter's bounded work.
  return (position: (value: { line: number; column: number }) => SyntaxPosition) => {
    const reportedTokens = new Set<string>();
    return (error: ParserSyntaxDiagnostic): ProjectedSyntaxDiagnostic | undefined => {
      if (!error.malformed) return undefined;
      const start = position(error.location.begin);
      const end = rangeEnd(start, position(error.location.end), error.message.endsWith("got <eof>"), error.message.startsWith("Expected type"));
      const token = `${end.line}:${end.character}`;
      if (reportedTokens.has(token) || isSparkdownSyntax(end)) return undefined;
      reportedTokens.add(token);
      return { start, end, code: "SyntaxError", message: error.message, syntax: true };
    };
  };
}

/** The existing Compiler.validateTypes grammar-token ownership predicate. */
export function grammarOwnsSyntaxDiagnostic(diagnostic: SyntaxRange, errors: readonly SyntaxRange[]): boolean {
  const token = { line: diagnostic.end.line, character: Math.max(diagnostic.end.character - 1, 0) };
  return errors.some(({ start, end }) => {
    const afterStart = token.line > start.line || (token.line === start.line && token.character >= start.character);
    const beforeEnd = token.line < end.line || (token.line === end.line && token.character <= end.character);
    return afterStart && beforeEnd;
  });
}

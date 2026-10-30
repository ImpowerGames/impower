import { readLuauStatementCandidate, luauPositionOffset, nextLuauToken } from "../typecheck/readLuauAst";
import type { SyntaxNode } from "@lezer/common";
import type { Location } from "../typecheck/Location";

export interface LuauStatementError {
  message: string;
  from: number;
  to: number;
}

export function luauStatementErrors(
  node: SyntaxNode,
  from: number,
  read: (from: number, to: number) => string,
  nodeEnd: number = from,
  document: (() => string) | undefined = undefined,
): { errors: LuauStatementError[]; to: number } {
  let documentText: string;
  if (document) documentText = document();
  else {
    let root = node;
    for (let parent = root.parent; parent; parent = root.parent) root = parent;
    documentText = read(0, root.to);
  }
  let lineEnd = endOfLine(Math.max(from, nodeEnd - 1), read);
  read: for (;;) {
    const next = nextLuauToken(lineEnd, documentText);
    const to = next ? endOfLine(next.from + next.text.length, read) : lineEnd;
    const text = read(from, to);
    const result = readLuauStatementCandidate(node, documentText, from, to);
    const errors: LuauStatementError[] = [];
    for (const error of result.errors) {
      const found = locate(error, documentText);
      if (BLOCK_KEYWORD_PAST_END.test(error.message) && found.from > from && found.from >= nodeEnd) break;
      let owner = statementHolding(
        result.root.body,
        error.location.begin,
        error.message.startsWith("Incomplete statement"),
      );
      const beginning = statementHolding(result.root.body, error.location.begin, true);
      if (owner && beginning !== owner && comesBefore(owner.location.end, error.location.end)) owner = beginning;
      if (owner) {
        const start = locate({ message: "", location: owner.location }, documentText).from;
        if (start > from && start >= nodeEnd) continue;
      }
      if (!next || found.from <= next.from) {
        errors.push(found);
        continue;
      }
      const last = lastStatementBefore(result.root.body, nodeEnd, documentText);
      if (!last || locate({ message: "", location: last.location }, documentText).to <= next.from) {
        continue;
      }
      if (found.from < from + text.trimEnd().length || to === lineEnd) {
        errors.push(found);
        continue;
      }
      lineEnd = to;
      continue read;
    }
    let end = nodeEnd;
    for (const statement of result.root.body) {
      const span = locate({ message: "", location: statement.location }, documentText);
      if (span.from < nodeEnd) end = Math.max(end, span.to);
    }
    return { errors, to: end };
  }
}

const BLOCK_KEYWORD_PAST_END = /^Expected <eof>, got '(?:end|else|elseif|until)'$/;

function statementHolding<T extends { location: { begin: { line: number; column: number } } }>(
  statements: T[],
  at: { line: number; column: number },
  atStart: boolean,
): T | null {
  let holding: T | null = null;
  for (const statement of statements) {
    const begin = statement.location.begin;
    if (
      begin.line < at.line ||
      (begin.line === at.line && (begin.column < at.column || (atStart && begin.column === at.column)))
    ) {
      holding = statement;
    }
  }
  return holding;
}

function lastStatementBefore<T extends { location: Location }>(statements: T[], end: number, documentText: string): T | null {
  let last: T | null = null;
  for (const statement of statements) {
    if (locate({ message: "", location: statement.location }, documentText).from < end) last = statement;
  }
  return last;
}

function comesBefore(a: { line: number; column: number }, b: { line: number; column: number }): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column);
}

function locate(
  error: {
    message: string;
    location: Location;
  },
  documentText: string,
): LuauStatementError {
  return {
    message: error.message,
    from: luauPositionOffset(error.location.begin, documentText),
    to: luauPositionOffset(error.location.end, documentText),
  };
}

function endOfLine(pos: number, read: (from: number, to: number) => string): number {
  const CHUNK = 256;
  for (let at = pos; ; at += CHUNK) {
    const text = read(at, at + CHUNK);
    const nl = text.indexOf("\n");
    if (nl >= 0) return at + nl;
    if (text.length < CHUNK) return at + text.length;
  }
}

import type { SyntaxNode } from "@lezer/common";
import { Location, Position } from "./Location";
import { loweredReadingEnd } from "./LuauUnitNodes";
import { luauPositionOffset, type LuauSyntaxError } from "./readLuauAst";

/**
 * A Sparkle handler closure's syntax errors as its lowerer reports them,
 * from its reading (`readLuauStatements`), which closes the function value
 * the closure runs as with an `end` of its own where the closure's `}`
 * stands (I-1368). An error at that `end` names a token the author did not
 * write: it is reported at the `}` and names the `}` (`got '}'`), and one
 * that finds the end of input there is left out. With no `}`, which the
 * closure's own report says is missing, an error at that `end` alone is
 * left out. Other errors, and those of any other body, are Luau's as read.
 */
export function closureReadingErrors(
  errors: readonly LuauSyntaxError[],
  body: SyntaxNode,
  documentText: string,
): LuauSyntaxError[] {
  if (body.name !== "LuauSparkleHandlerClosure") return [...errors];
  const end = loweredReadingEnd(body);
  const brace = body.getChild("LuauSparkleHandlerClosure_end");
  const out: LuauSyntaxError[] = [];
  for (const error of errors) {
    const from = luauPositionOffset(error.location.begin, documentText);
    const to = luauPositionOffset(error.location.end, documentText);
    if (to !== end) {
      out.push(error);
      continue;
    }
    if (!brace || brace.from === brace.to) {
      if (from !== to) out.push(error);
      continue;
    }
    // The end of input past that `end` (the function value left open when
    // the `end` was read as something else) is past the `}`, and no part
    // of the closure.
    if (/got <eof>(?=;|$)/.test(error.message)) continue;
    const message = error.message.replace(/got 'end'(?=;|$)/, "got '}'");
    if (message === error.message) {
      out.push(error);
      continue;
    }
    const begin = from === to ? positionAt(brace.from, documentText) : error.location.begin;
    out.push({ ...error, message, location: new Location(begin, positionAt(brace.to, documentText)) });
  }
  return out;
}

/** The position of a document offset, in lines and UTF-16 columns. */
function positionAt(offset: number, documentText: string): Position {
  const lineStart = documentText.lastIndexOf("\n", offset - 1) + 1;
  let line = 0;
  for (let i = documentText.indexOf("\n"); i >= 0 && i < lineStart; i = documentText.indexOf("\n", i + 1)) line += 1;
  return new Position(line, offset - lineStart);
}

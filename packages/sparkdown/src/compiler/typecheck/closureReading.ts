import type { SyntaxNode } from "@lezer/common";
import { Location, Position } from "./Location";
import { loweredReadingEnd } from "./LuauUnitNodes";
import { luauPositionOffset, type LuauSyntaxError } from "./readLuauAst";

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

function positionAt(offset: number, documentText: string): Position {
  const lineStart = documentText.lastIndexOf("\n", offset - 1) + 1;
  let line = 0;
  for (let i = documentText.indexOf("\n"); i >= 0 && i < lineStart; i = documentText.indexOf("\n", i + 1)) line += 1;
  return new Position(line, offset - lineStart);
}

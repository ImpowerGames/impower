import { DebugMetadata } from "../../../runtime/DebugMetadata";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { LowerContext } from "../context";

export function buildDebugMetadata(
  from: number,
  to: number,
  ctx: LowerContext,
): DebugMetadata {
  const dm = new DebugMetadata();
  dm.startLineNumber = ctx.lineNumber(from) + 1;
  dm.endLineNumber = ctx.lineNumber(to) + 1;
  dm.startCharacterNumber = ctx.characterNumber(from) + 1;
  dm.endCharacterNumber = ctx.characterNumber(to) + 1;
  if (ctx.filePath) {
    dm.filePath = ctx.filePath;
  }
  return dm;
}

export function identifierAt(
  node: { from: number; to: number },
  ctx: LowerContext,
): Identifier {
  const identifier = new Identifier(ctx.read(node.from, node.to));
  identifier.debugMetadata = buildDebugMetadata(node.from, node.to, ctx);
  return identifier;
}

export function headerLineRange(
  from: number,
  to: number,
  ctx: LowerContext,
): { from: number; to: number } {
  const text = ctx.read(from, to);
  const start = text.length - text.trimStart().length;
  // value-level: the source text of one statement range, finding its first line end
  const newline = text.indexOf("\n", start);
  const line = newline < 0 ? text : text.slice(0, newline);
  return { from: from + start, to: from + line.trimEnd().length };
}

export function statementBounds(
  rangeFrom: number,
  rangeTo: number,
  ctx: LowerContext,
): { from: number; to: number } {
  // value-level: the statement's isolated source range, trimming its trailing whitespace
  const text = ctx.read(rangeFrom, rangeTo).replace(/\s+$/, "");
  // value-level: the isolated statement text, measuring its indentation
  const indentation = text.length - text.replace(/^[ \t]+/, "").length;
  return { from: rangeFrom + indentation, to: rangeFrom + text.length };
}

export function stampDebugMetadata(
  objects: ParsedObject[] | undefined,
  from: number,
  to: number,
  ctx: LowerContext,
): void {
  if (!objects || objects.length === 0) return;
  const dm = buildDebugMetadata(from, to, ctx);
  for (const obj of objects) {
    if (!obj.debugMetadata) {
      obj.debugMetadata = dm;
    }
  }
}

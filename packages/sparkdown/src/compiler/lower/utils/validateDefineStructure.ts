import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";

// Structural checks for a `define` block. The grammar ends a define at its
// `end` keyword or, failing that, at the next `scene` / `branch` beat or the
// end of the document, so a missing `end` makes the define swallow every
// top-level line up to that point (a `store x = 1` below it parses as a stored
// property of the define). The define header ends at `with`; a header written
// any other way (`define hero as character:`) leaves the lines under it
// outside the header, where they are not properties. Neither shape is a parse
// error, so both are reported here:
//
//   - a define whose `LuauDefine_end` holds no `end` keyword is missing its
//     `end` (reported on the header line);
//   - a define whose header did not reach `with` may hold nothing but
//     whitespace and comments before its `end`. Text on the header line is
//     reported where it starts; text on a later line means the body is missing
//     its `with`. When the define is also missing its `end`, only header-line
//     text is reported, since what follows is not clearly meant as a body.

const TRIVIA = new Set([
  "Newline",
  "Whitespace",
  "OptionalWhitespace",
  "ExtraWhitespace",
]);

function isTrivia(node: SyntaxNode): boolean {
  return TRIVIA.has(node.name) || node.name.includes("Comment");
}

function makeSource(
  from: number,
  to: number,
  ctx: LowerContext,
): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(from) + 1,
    endLineNumber: ctx.lineNumber(to) + 1,
    startCharacterNumber: ctx.characterNumber(from) + 1,
    endCharacterNumber: ctx.characterNumber(to) + 1,
  };
}

// The span of non-blank text starting at or after `from`, clipped to the end
// of its line (and to `limit`), or null when only whitespace remains.
function lineTextSpan(
  from: number,
  limit: number,
  ctx: LowerContext,
): { from: number; to: number; text: string } | null {
  const text = ctx.read(from, limit);
  const start = text.search(/\S/);
  if (start < 0) return null;
  const lineBreak = text.slice(start).search(/[\r\n]/);
  const lineText =
    lineBreak < 0 ? text.slice(start) : text.slice(start, start + lineBreak);
  const trimmed = lineText.trimEnd();
  return {
    from: from + start,
    to: from + start + trimmed.length,
    text: trimmed,
  };
}

export function validateDefineStructure(
  node: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];

  const endNode = findChildByName(node, "LuauDefine_end");
  const hasEnd = !!endNode && !!getDescendent("LuauEndKeyword", endNode);
  const headerLine = lineTextSpan(node.from, node.to, ctx);
  if (!hasEnd && headerLine) {
    diagnostics.push({
      message:
        "Define is missing its closing `end` keyword. Without it, every line up to the next `scene`, `branch` or the end of the file is read as part of this define.",
      severity: ErrorType.Error,
      source: makeSource(headerLine.from, headerLine.to, ctx),
    });
  }

  const content = findChildByName(node, "LuauDefine_content");
  const header = content
    ? findChildByName(content, "LuauDefineNameAndInheritance")
    : null;
  if (!content || !header || !headerLine) return diagnostics;
  const headerEnd = findChildByName(header, "LuauDefineNameAndInheritance_end");
  if (headerEnd && getDescendent("LuauWithKeyword", headerEnd)) {
    return diagnostics;
  }

  let child = header.nextSibling;
  while (child && isTrivia(child)) child = child.nextSibling;
  if (!child) return diagnostics;
  const unexpected = lineTextSpan(child.from, content.to, ctx);
  if (!unexpected) return diagnostics;
  const onHeaderLine =
    ctx.lineNumber(unexpected.from) === ctx.lineNumber(headerLine.from);
  if (onHeaderLine) {
    diagnostics.push({
      message: `Unexpected \`${unexpected.text}\` in the define header. A define header is its name and optional \`as\` parent, followed by \`with\` when properties come next: \`define hero as character with\` … \`end\`.`,
      severity: ErrorType.Error,
      source: makeSource(unexpected.from, unexpected.to, ctx),
    });
  } else if (hasEnd) {
    diagnostics.push({
      message:
        "This define has a body, but its define header does not end in `with`, so the body is not read as properties. Add `with` to the end of the header: `define hero as character with` … `end`.",
      severity: ErrorType.Error,
      source: makeSource(unexpected.from, unexpected.to, ctx),
    });
  }
  return diagnostics;
}

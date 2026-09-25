import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";

// Structural checks for a `define` block, none of which is a parse error:
//
//   - A define with no name is reported on its `define` keyword, and nothing
//     else is checked; the lowerer drops a nameless define.
//   - A header the grammar cannot read to its end (a dotted name such as
//     `config.thing`, or a letter outside `[A-Za-z0-9_]`) cuts the define off
//     on its own header line, before any `end`, and leaves the rest of the
//     script to parse as top-level lines. That shape is reported on the
//     readable part of the header rather than as a missing `end`.
//   - Otherwise the grammar ends a define at its `end` keyword or, failing
//     that, at the next `scene` / `branch` beat or the end of the document, so
//     a missing `end` makes the define swallow every top-level line up to that
//     point (a `store x = 1` below it parses as a stored property). A define
//     whose `LuauDefine_end` holds no `end` keyword is reported on its header
//     line.
//   - A header that does not end in `with` may be followed on its own line by
//     nothing but whitespace or a comment. Anything else there is reported where
//     it starts: after `define hero as character:` the `:` keeps the header from
//     reaching `with`, and the indented properties parse outside the header,
//     where they are dropped. A body on the lines below a header without `with`
//     is read as properties, but `with` is the documented form, so it is
//     reported on the body's first line when the define has its `end`.
//
// Every check reads only the define's own node: its `end` keyword is inside
// that node, so an edit that changes the result re-lowers this chunk, and the
// check can run in the lowerer. The scene and branch `end` checks cannot
// (`validateSceneBranchScope.ts`): their `end` is a later root-level sibling,
// so they run over the whole document each compile.

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

const WITH_FORM =
  "A define header is its name and optional `as` parent, followed by `with` when properties come next: `define hero as character with` … `end`.";

export function validateDefineStructure(
  node: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const headerLine = lineTextSpan(node.from, node.to, ctx);
  if (!headerLine) return [];
  const error = (message: string, from: number, to: number): InkDiagnostic => ({
    message,
    severity: ErrorType.Error,
    source: makeSource(from, to, ctx),
  });

  if (!getDescendent("LuauDefineName", node)) {
    return [
      error(
        `This define has no name. ${WITH_FORM}`,
        headerLine.from,
        headerLine.to,
      ),
    ];
  }

  const endNode = findChildByName(node, "LuauDefine_end");
  const hasEnd = !!endNode && !!getDescendent("LuauEndKeyword", endNode);
  const endsOnHeaderLine =
    ctx.lineNumber(node.to) === ctx.lineNumber(headerLine.from);
  if (
    !hasEnd &&
    endsOnHeaderLine &&
    findChildByName(node, "ERROR_INCOMPLETE")
  ) {
    return [
      error(
        `This define header cannot be read past \`${headerLine.text}\`. A define name and its \`as\` parent use only letters, digits and underscores. ${WITH_FORM}`,
        headerLine.from,
        headerLine.to,
      ),
    ];
  }

  const diagnostics: InkDiagnostic[] = [];
  if (!hasEnd) {
    diagnostics.push(
      error(
        "Define is missing its closing `end` keyword. Without it, every line up to the next `scene`, `branch` or the end of the file is read as part of this define.",
        headerLine.from,
        headerLine.to,
      ),
    );
  }

  const content = findChildByName(node, "LuauDefine_content");
  const header = content
    ? findChildByName(content, "LuauDefineNameAndInheritance")
    : null;
  if (!content || !header) return diagnostics;
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
    diagnostics.push(
      error(
        `Unexpected \`${unexpected.text}\` in the define header. ${WITH_FORM}`,
        unexpected.from,
        unexpected.to,
      ),
    );
  } else if (hasEnd) {
    diagnostics.push(
      error(
        "This define has a body, so its define header needs `with` at the end: `define hero as character with` … `end`.",
        unexpected.from,
        unexpected.to,
      ),
    );
  }
  return diagnostics;
}

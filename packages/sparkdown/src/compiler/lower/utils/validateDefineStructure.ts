import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { UNREAD_TOKENS } from "../../utils/unreadTokens";
import { DEFINE_MEMBERS } from "../../utils/defineStatement";

const TRIVIA = new Set([
  "Newline",
  "Whitespace",
  "OptionalWhitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
]);

export function isTrivia(node: SyntaxNode): boolean {
  return TRIVIA.has(node.name) || node.name.includes("Comment");
}

export function makeSource(
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

export function lineTextSpan(
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


const WITH_FORM = "`define hero as character with` … `end`";
const NAME_RULE =
  "Define names and `as` parents use only A–Z, a–z, 0–9 and `_`, and start with a letter or `_`.";

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
  const onHeaderLine = (pos: number) =>
    ctx.lineNumber(pos) === ctx.lineNumber(headerLine.from);

  const content = findChildByName(node, "LuauDefine_content");
  if (!getDescendent("LuauDefineName", node)) {
    let first = content?.firstChild ?? null;
    while (first && isTrivia(first)) first = first.nextSibling;
    const token =
      first && onHeaderLine(first.from)
        ? lineTextSpan(first.from, first.to, ctx)
        : null;
    if (token) {
      return [
        error(
          `\`${token.text}\` cannot be a define name. ${NAME_RULE}`,
          token.from,
          token.to,
        ),
      ];
    }
    return [
      error(
        `This define has no name: ${WITH_FORM}.`,
        headerLine.from,
        headerLine.to,
      ),
    ];
  }

  const header = content
    ? findChildByName(content, "LuauDefineNameAndInheritance")
    : null;
  const headerEnd = header
    ? findChildByName(header, "LuauDefineNameAndInheritance_end")
    : null;
  const reachedWith =
    !!headerEnd && !!getDescendent("LuauWithKeyword", headerEnd);
  const endNode = findChildByName(node, "LuauDefine_end");
  const hasEnd = !!endNode && !!getDescendent("LuauEndKeyword", endNode);
  let rest = header?.nextSibling ?? null;
  while (rest && isTrivia(rest)) rest = rest.nextSibling;
  if (
    header &&
    rest &&
    onHeaderLine(rest.from) &&
    UNREAD_TOKENS.has(rest.name) &&
    (reachedWith || rest.from === header.to)
  ) {
    const readable = lineTextSpan(headerLine.from, header.to, ctx) ?? headerLine;
    return [
      error(
        reachedWith
          ? `This define cannot be read past \`${readable.text}\`. Its properties go on the lines below the header, and it closes with \`end\`.`
          : `${NAME_RULE} This define header cannot be read past \`${readable.text}\`.`,
        readable.from,
        readable.to,
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
  if (!content || !header) return diagnostics;

  let child = header.nextSibling;
  while (child && isTrivia(child)) child = child.nextSibling;
  if (!child) return diagnostics;
  if (reachedWith) {
    const afterWith = DEFINE_MEMBERS.has(child.name)
      ? null
      : lineTextSpan(child.from, content.to, ctx);
    if (afterWith && onHeaderLine(afterWith.from)) {
      diagnostics.push(
        error(
          `Unexpected \`${afterWith.text}\` after \`with\` in the define header. A define's properties go on the lines below its header: ${WITH_FORM}.`,
          afterWith.from,
          afterWith.to,
        ),
      );
    }
    return diagnostics;
  }
  const unexpected = lineTextSpan(child.from, content.to, ctx);
  if (!unexpected) return diagnostics;
  if (onHeaderLine(unexpected.from)) {
    diagnostics.push(
      error(
        `Unexpected \`${unexpected.text}\` in the define header. A header with properties ends in \`with\`: ${WITH_FORM}.`,
        unexpected.from,
        unexpected.to,
      ),
    );
  } else if (hasEnd) {
    diagnostics.push(
      error(
        `This define has a body, so its header line needs \`with\` at the end: ${WITH_FORM}.`,
        unexpected.from,
        unexpected.to,
      ),
    );
  }
  return diagnostics;
}

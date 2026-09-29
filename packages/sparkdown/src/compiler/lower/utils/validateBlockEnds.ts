import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

// Reports every Luau function, type function, `if`, `do`, `while`, `for` and
// `repeat` block in a chunk that is left open.
//
// The grammar ends one of these blocks at its `end` keyword or, failing that,
// at the next `scene` / `branch` beat or the end of the document, and records
// no error either way. A block with no `end` therefore takes in every line up
// to the next `end` word, beat or the end of the file. When a block nested
// inside it is also missing its `end`, the `end` written for the outer block
// closes the inner one, so the block left open is the outer one; that is the
// block reported, as Luau reports it.
//
// A block is left open when its `_end` node holds no `end` keyword, or when
// the statement before that `end` on its line is a bare name such as `The` in
// `The end of the scene.`: a bare name is never a Luau statement, so the `end`
// is a word in a line of text that the block took in. A `repeat` loop is left
// open when no `until` follows it.
//
// A `while` or `for` loop ends after its `do` block, whose `end` closes both,
// so an unclosed `do` block that belongs to a loop is reported as the loop.
//
// Every block's `end` (or `until`) is inside the chunk that holds the block, or
// is the text right after it, so an edit that changes the result changes the
// chunk and re-lowers it.

const END_BLOCKS: Readonly<Record<string, string>> = {
  LuauFunctionDefinition: "function",
  LuauFunctionTypeDeclaration: "type function",
  LuauIfBlock: "`if` block",
  LuauSparkdownIfBlock: "`if` block",
  LuauDoBlock: "`do` block",
  LuauSparkdownDoBlock: "`do` block",
};

const LOOPS: Readonly<Record<string, string>> = {
  LuauWhileLoop: "`while` loop",
  LuauSparkdownWhileLoop: "`while` loop",
  LuauForLoop: "`for` loop",
  LuauSparkdownForLoop: "`for` loop",
};

const REPEAT_LOOPS = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop"]);

// The nodes whose children are the statements of a block body.
const STATEMENT_LISTS = nodeNameSet([
  "LuauFunctionDefinition_content",
  "LuauFunctionBody_content",
  "LuauFunctionTypeDeclaration_content",
  "LuauIfBlock_content",
  "LuauSparkdownIfBlock_content",
  "LuauElseifBlock_content",
  "LuauSparkdownElseifBlock_content",
  "LuauElseBlock_content",
  "LuauSparkdownElseBlock_content",
  "LuauDoBlock_content",
  "LuauSparkdownDoBlock_content",
]);

const TRIVIA = nodeNameSet([
  "Newline",
  "Whitespace",
  "OptionalWhitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
]);

// The bare-name statement that ends on the line of `endKeyword`, right before
// it, or null when the text before `end` on its line is anything else.
function bareNameBefore(
  endKeyword: SyntaxNode,
  block: SyntaxNode,
  ctx: LowerContext,
): SyntaxNode | null {
  const lineStart = endKeyword.from - ctx.characterNumber(endKeyword.from);
  const before = ctx.read(lineStart, endKeyword.from).trimEnd();
  if (!before.trim()) return null;
  let statement: SyntaxNode | null = block.resolveInner(
    lineStart + before.length,
    -1,
  );
  while (
    statement &&
    statement !== block &&
    !STATEMENT_LISTS.has(statement.parent?.name ?? "")
  ) {
    statement = statement.parent;
  }
  if (!statement || statement === block) return null;
  if (statement.name !== "LuauAccessPath") return null;
  if (getDescendent("LuauFunctionCall", statement)) return null;
  return statement;
}

function nextNonTrivia(node: SyntaxNode): SyntaxNode | null {
  let next = node.nextSibling;
  while (next && TRIVIA.has(next.name)) next = next.nextSibling;
  return next;
}

export function validateBlockEnds(
  chunk: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const report = (header: SyntaxNode, message: string) => {
    const line = lineTextSpan(header.from, header.to, ctx);
    if (!line) return;
    diagnostics.push({
      message,
      severity: ErrorType.Error,
      source: makeSource(line.from, line.to, ctx),
    });
  };

  const visit = (node: SyntaxNode) => {
    const kind = END_BLOCKS[node.name];
    if (kind) {
      const loop = node.parent?.parent ?? null;
      const loopKind = loop ? LOOPS[loop.name] : undefined;
      const header = loopKind ? loop! : node;
      const label = loopKind ?? kind;
      const endNode = findChildByName(node, `${node.name}_end`);
      const endKeyword = endNode
        ? getDescendent("LuauEndKeyword", endNode)
        : null;
      if (!endKeyword) {
        report(
          header,
          `This ${label} is missing its closing \`end\` keyword. Without it, the lines below it are read as part of this ${label}, up to the next \`scene\`, \`branch\` or the end of the file.`,
        );
      } else {
        const name = bareNameBefore(endKeyword, node, ctx);
        if (name) {
          const words = ctx.read(name.from, endKeyword.to);
          report(
            header,
            `This ${label} is missing its closing \`end\` keyword. The \`end\` in \`${words}\` is a word in a line of text, which this ${label} read as part of itself.`,
          );
        }
      }
    } else if (REPEAT_LOOPS.has(node.name)) {
      if (nextNonTrivia(node)?.name !== "LuauUntilStatement") {
        report(
          node,
          "This `repeat` loop is missing its closing `until`. Without it, every line up to the next `scene`, `branch` or the end of the file is read as part of this loop.",
        );
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(chunk);
  return diagnostics;
}

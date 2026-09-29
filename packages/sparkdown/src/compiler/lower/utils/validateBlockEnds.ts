import { type SyntaxNode } from "@lezer/common";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { loopBodyBlock } from "./loopDoBlock";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

// Reports every Luau function, type function, `if`, `do`, `while`, `for` and
// `repeat` block that is left open.
//
// The grammar ends one of these blocks in one of three ways, and records no
// error for any of them:
//
//   - at its `end` keyword, which its `_end` node holds;
//   - just before the next `scene` / `branch` beat, with an empty `_end` node;
//   - with no `_end` node at all, where the block's text stops being Luau (a
//     story line in a function's body) or at the end of the document. The rest
//     of the block then follows as root-level chunks of its own, and a
//     root-level `end` closes it.
//
// The first two are read from the block's own node, so `validateBlockEnds`
// checks them for each chunk as it is lowered. The third depends on the
// root-level `end` siblings after the chunk, so `validateOpenBlocks` checks it
// over the whole document each compile, as the scene and branch `end` checks
// do (`validateSceneBranchScope.ts`): a per-chunk result would go stale when
// only a later `end` is edited.
//
// When a block nested inside another is also missing its `end`, the `end`
// written for the outer block closes the inner one, so the block left open is
// the outer one; that is the block reported, as Luau reports it.
//
// The word `end` in a line of text closes a block the same way, as in
// `The end of the scene.` under a function with no `end` of its own. That is
// recognised for a root-level block, whose `end` can be followed on its line
// by nothing but a comment: the rest of such a line (`of the scene.`) is a
// root-level line of its own, so `validateOpenBlocks` reports the block. The
// text before the `end` cannot tell, since a bare name such as `The` is a
// statement (a call of that name).
//
// A `while` or `for` loop ends after its `do` block, whose `end` closes both,
// so an unclosed `do` block that belongs to a loop is reported as the loop.
//
// A `repeat` loop closes at `until`, never at `end`, so it is checked only
// against its own node and the `until` that follows it. It is reported only
// when no `until` follows it or is anywhere inside it: a `repeat` whose
// `until` the grammar reads inside one of its statements is a parse defect,
// and telling the author an `until` they wrote is missing would mislead them.

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

const TRIVIA = nodeNameSet([
  "Newline",
  "Whitespace",
  "OptionalWhitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
  "LuauComment",
]);

interface Block {
  // The line the diagnostic is reported on: the loop's for a loop's `do`.
  header: SyntaxNode;
  label: string;
}

function asBlock(node: SyntaxNode): Block | null {
  const kind = END_BLOCKS[node.name];
  if (!kind) return null;
  // The nearest enclosing loop, if the block is that loop's body.
  for (let up = node.parent; up && !END_BLOCKS[up.name]; up = up.parent) {
    const loopKind = LOOPS[up.name];
    if (!loopKind) continue;
    const body = loopBodyBlock(up as GrammarSyntaxNode<SparkdownNodeName>);
    if (body?.from === node.from && body.name === node.name) {
      return { header: up, label: loopKind };
    }
    break;
  }
  return { header: node, label: kind };
}

function missingEndMessage(label: string): string {
  return `This ${label} is missing its closing \`end\` keyword. Without it, the lines below it are read as part of this ${label}, up to the next \`scene\`, \`branch\` or the end of the file.`;
}

function report(
  diagnostics: InkDiagnostic[],
  header: SyntaxNode,
  message: string,
  ctx: LowerContext,
): void {
  const line = lineTextSpan(header.from, header.to, ctx);
  if (!line) return;
  diagnostics.push({
    message,
    severity: ErrorType.Error,
    source: makeSource(line.from, line.to, ctx),
  });
}

function hasUntil(repeat: SyntaxNode): boolean {
  let next = repeat.nextSibling;
  while (next && TRIVIA.has(next.name)) next = next.nextSibling;
  if (next?.name === "LuauUntilStatement") return true;
  return !!getDescendent("LuauUntilStatement", repeat);
}

// Checks the blocks of one chunk that the chunk's own nodes show to be open:
// those cut off before a `scene` or `branch`, and `repeat` loops with no
// `until`.
export function validateBlockEnds(
  chunk: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const visit = (node: SyntaxNode) => {
    const block = asBlock(node);
    if (block) {
      const endNode = findChildByName(node, `${node.name}_end`);
      if (endNode && !getDescendent("LuauEndKeyword", endNode)) {
        report(diagnostics, block.header, missingEndMessage(block.label), ctx);
      }
    } else if (REPEAT_LOOPS.has(node.name) && !hasUntil(node)) {
      report(
        diagnostics,
        node,
        "This `repeat` loop is missing its closing `until`. Without it, the lines below it are read as part of this loop, up to the next `scene`, `branch` or the end of the file.",
        ctx,
      );
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(chunk);
  return diagnostics;
}

// The blocks a root-level chunk leaves open for later root-level `end`s to
// close, outermost first. Only a block with no `_end` node is open this way,
// and every such block holds the point where the grammar stopped reading it,
// so they all lie on the path through each node's last child.
function openChain(root: SyntaxNode): Block[] {
  const chain: Block[] = [];
  let node: SyntaxNode | null = root;
  while (node) {
    if (END_BLOCKS[node.name]) {
      if (findChildByName(node, `${node.name}_end`)) break;
      chain.push(asBlock(node)!);
    }
    let child: SyntaxNode | null = node.lastChild;
    while (
      child &&
      (TRIVIA.has(child.name) || child.name === "ERROR_INCOMPLETE")
    ) {
      child = child.prevSibling;
    }
    node = child;
  }
  return chain;
}

// The line of text a root-level block's `end` keyword belongs to, when a
// root-level line of text continues after it on the same line.
function proseEndLine(
  root: SyntaxNode,
  ctx: LowerContext,
): { text: string } | null {
  const endNode = findChildByName(root, `${root.name}_end`);
  const endKeyword = endNode ? getDescendent("LuauEndKeyword", endNode) : null;
  if (!endKeyword) return null;
  let next = root.nextSibling;
  while (next && TRIVIA.has(next.name) && next.name !== "Newline") {
    next = next.nextSibling;
  }
  if (!next || TRIVIA.has(next.name)) return null;
  if (ctx.lineNumber(next.from) !== ctx.lineNumber(endKeyword.from)) {
    return null;
  }
  const lineStart = endKeyword.from - ctx.characterNumber(endKeyword.from);
  return lineTextSpan(lineStart, next.to, ctx);
}

const OPENING_ROOTS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauSparkdownIfBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownForLoop",
]);

// Checks, over the root-level nodes of a whole document, the blocks that
// chunks leave open for a later root-level `end` to close, and the root-level
// blocks closed by an `end` in a line of text. Each root-level `end` closes
// the innermost block or section still open, a `scene` or `branch` sets aside
// every block still open before it, and the end of the document every block
// still open at all. Scenes and branches take part only so that their own
// `end`s are not counted as a block's; whether they are closed is
// `validateSceneBranchScope.ts`'s to report.
export function validateOpenBlocks(
  top: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const open: (Block | "section")[] = [];
  const reportOpen = () => {
    for (const entry of open) {
      if (entry !== "section") {
        report(diagnostics, entry.header, missingEndMessage(entry.label), ctx);
      }
    }
  };
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (node.name === "Scene" || node.name === "Branch") {
      reportOpen();
      const sections = open.filter((entry) => entry === "section");
      open.length = 0;
      open.push(...sections, "section");
    } else if (node.name === "LuauEndKeyword") {
      open.pop();
    } else if (OPENING_ROOTS.has(node.name)) {
      open.push(...openChain(node));
      const block = asBlock(node);
      const prose = block ? proseEndLine(node, ctx) : null;
      if (block && prose) {
        report(
          diagnostics,
          block.header,
          `This ${block.label} is missing its closing \`end\` keyword. The \`end\` in \`${prose.text}\` is a word in a line of text, which this ${block.label} read as part of itself.`,
          ctx,
        );
      }
    }
  }
  reportOpen();
  return diagnostics;
}

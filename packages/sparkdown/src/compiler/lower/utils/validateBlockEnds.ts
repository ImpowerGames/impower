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
import { isTrivia, lineTextSpan, makeSource } from "./validateDefineStructure";

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
// the outer one; that is the block reported, as Luau reports it. A scene or
// branch whose `end` a block inside it took is left open the same way. The
// `end`s alone cannot say whether the author left out the block's or the
// scene's, so the block that took it is reported as missing one or the other.
//
// The word `end` in a line of text closes a block the same way, as in
// `The end of the scene.` under a function with no `end` of its own. For a
// root-level block, the rest of such a line (`of the scene.`) is a root-level
// line of text of its own. A block whose `end` is followed on its line by a
// line of text is therefore treated as still open, and reported as closed by
// that word only when no later root-level `end` closes it. A later `end` does
// close it where the grammar misread the line (`if {} then … end assert(x)`
// reads the `if`'s `end` as the function's). The text before the `end` cannot
// tell, since a bare name such as `The` is a statement (a call of that name).
//
// A `while` or `for` loop ends after its `do` block, whose `end` closes both,
// so an unclosed `do` block that belongs to a loop is reported as the loop.
//
// A `repeat` loop closes at `until`, never at `end`, so it is checked only
// against its own node and the `until` that follows it. It is reported only
// when neither an `until` follows it nor more `until`s lie inside it than
// nested `repeat`s to take them: a `repeat` whose `until` the grammar reads
// inside one of its statements is a parse defect (#1092), and telling the
// author an `until` they wrote is missing would mislead them.

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

function countDescendants(node: SyntaxNode, names: Set<string>): number {
  let count = 0;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) count++;
    count += countDescendants(child, names);
  }
  return count;
}

const UNTIL = nodeNameSet(["LuauUntilStatement"]);

// Whether the `until`s that follow `repeat` or lie inside it are enough for
// it and the `repeat` loops nested in it. The grammar can end nested loops at
// the same `until` and hang it after the outermost, where Luau gives it to the
// innermost, so the count decides rather than where each `until` sits.
function hasUntil(repeat: SyntaxNode): boolean {
  let next = repeat.nextSibling;
  while (next && isTrivia(next)) next = next.nextSibling;
  const following = next?.name === "LuauUntilStatement" ? 1 : 0;
  return (
    following + countDescendants(repeat, UNTIL) >
    countDescendants(repeat, REPEAT_LOOPS)
  );
}

// The `end` keyword inside a block's `_end` node, if it has one.
function endKeywordOf(node: SyntaxNode): SyntaxNode | null {
  const endNode = findChildByName(node, `${node.name}_end`);
  if (!endNode || endNode.from === endNode.to) return null;
  const keyword = getDescendent("LuauEndKeyword", endNode);
  return keyword && keyword.to <= endNode.to ? keyword : null;
}

// Checks the blocks of one chunk that the chunk's own nodes show to be open:
// those cut off before a `scene` or `branch`, and `repeat` loops with no
// `until`. A `repeat` left open is reported as the outermost of the loops
// that share the `until`s it holds, as Luau reports it, and the loops inside
// it are not reported again.
export function validateBlockEnds(
  chunk: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const visit = (node: SyntaxNode, insideOpenRepeat: boolean) => {
    const block = asBlock(node);
    let openRepeat = insideOpenRepeat;
    if (block) {
      if (findChildByName(node, `${node.name}_end`) && !endKeywordOf(node)) {
        report(diagnostics, block.header, missingEndMessage(block.label), ctx);
      }
    } else if (
      REPEAT_LOOPS.has(node.name) &&
      !insideOpenRepeat &&
      !hasUntil(node)
    ) {
      openRepeat = true;
      report(
        diagnostics,
        node,
        "This `repeat` loop is missing its closing `until`. Without it, the lines below it are read as part of this loop, up to the next `scene`, `branch` or the end of the file.",
        ctx,
      );
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child, openRepeat);
    }
  };
  visit(chunk, false);
  return diagnostics;
}

// The blocks a root-level chunk leaves open for later root-level `end`s to
// close, outermost first. Only a block with no `_end` node is open this way,
// and every such block holds the point where the grammar stopped reading it,
// so they all lie on the path through each node's last child that has text.
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
      (child.from === child.to ||
        isTrivia(child) ||
        child.name === "ERROR_INCOMPLETE")
    ) {
      child = child.prevSibling;
    }
    node = child;
  }
  return chain;
}

// The line holding a root-level block's `end` keyword, when a line of text
// continues after the keyword on that line.
function proseEndLine(
  root: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const endKeyword = endKeywordOf(root);
  if (!endKeyword) return null;
  let next = root.nextSibling;
  while (next && isTrivia(next) && next.name !== "Newline") {
    next = next.nextSibling;
  }
  if (!next || next.name === "Newline") return null;
  if (ctx.lineNumber(next.from) !== ctx.lineNumber(endKeyword.from)) {
    return null;
  }
  const text = getDescendent("TextChunk", next);
  if (!text || text.from >= next.to) return null;
  const rest = lineTextSpan(endKeyword.to, next.to, ctx)?.text ?? "";
  if (!rest || rest.startsWith("//") || rest.startsWith("--")) return null;
  const lineStart = endKeyword.from - ctx.characterNumber(endKeyword.from);
  return lineTextSpan(lineStart, next.to, ctx)?.text ?? null;
}

const OPENING_ROOTS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauSparkdownIfBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownForLoop",
]);

type OpenEntry =
  | { kind: "block"; block: Block; proseLine?: string }
  // A scene or branch, and the last block an `end` closed while it was open.
  | { kind: "scene" | "branch"; lastClosed?: Block };

// Checks, over the root-level nodes of a whole document, the blocks that
// chunks leave open for a later root-level `end` to close. Each root-level
// `end` closes the innermost block, scene or branch still open. A `branch`
// sets aside every block still open before it, and a `scene` or the end of
// the document every block, scene and branch. Scenes and branches take part
// so that their own `end`s are not counted as a block's: one left open after
// a block inside it took an `end` is reported on that block, and one no block
// took an `end` from is `validateSceneBranchScope.ts`'s to report.
export function validateOpenBlocks(
  top: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const open: OpenEntry[] = [];
  const reportEntry = (entry: OpenEntry) => {
    if (entry.kind === "block") {
      const { header, label } = entry.block;
      report(
        diagnostics,
        header,
        entry.proseLine !== undefined
          ? `This ${label} is missing its closing \`end\` keyword. The \`end\` in \`${entry.proseLine}\` is a word in a line of text, which this ${label} read as part of itself.`
          : missingEndMessage(label),
        ctx,
      );
    } else if (entry.lastClosed) {
      const { header, label } = entry.lastClosed;
      report(
        diagnostics,
        header,
        `This ${label} or the ${entry.kind} around it is missing its closing \`end\` keyword. The \`end\` after this ${label} closes it, which leaves the ${entry.kind} without one.`,
        ctx,
      );
    }
  };
  // Reports and removes the open entries above the innermost one that
  // `keep` accepts.
  const closeAbove = (keep: (entry: OpenEntry) => boolean) => {
    while (open.length > 0 && !keep(open.at(-1)!)) {
      reportEntry(open.pop()!);
    }
  };
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (node.name === "Scene") {
      closeAbove(() => false);
      open.push({ kind: "scene" });
    } else if (node.name === "Branch") {
      closeAbove((entry) => entry.kind === "scene");
      open.push({ kind: "branch" });
    } else if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed?.kind === "block") {
        for (let i = open.length - 1; i >= 0; i--) {
          const entry = open[i]!;
          if (entry.kind !== "block") {
            entry.lastClosed = closed.block;
            break;
          }
        }
      }
    } else if (OPENING_ROOTS.has(node.name)) {
      for (const block of openChain(node)) {
        open.push({ kind: "block", block });
      }
      const block = asBlock(node);
      const proseLine = block ? proseEndLine(node, ctx) : null;
      if (block && proseLine !== null) {
        open.push({ kind: "block", block, proseLine });
      }
    }
  }
  closeAbove(() => false);
  return diagnostics;
}

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
//   - with no `_end` node at all, at a line of its body the grammar cannot
//     read as Luau or at the end of the document. The rest of the block then
//     follows as root-level chunks of its own, and a root-level `end` closes
//     it.
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
// line of text of its own. The tree cannot tell that from code the grammar
// read as text after a block's own `end` (`end bump()`, or `if {} then … end
// assert(x)`, whose `if`'s `end` the grammar gives to the function around it),
// and the text before the `end` cannot tell either, since a bare name such as
// `The` is a statement (a call of that name). Every reading leaves that text
// displayed rather than run, so a root-level block whose `end` is followed on
// its line by a line of text gets a warning on that line that says so, rather
// than an error claiming its `end` is missing.
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
  LuauSparkdownExplicitIfBlock: "`if` block",
  LuauDoBlock: "`do` block",
  LuauSparkdownDoBlock: "`do` block",
  LuauSparkdownExplicitDoBlock: "`do` block",
};

const LOOPS: Readonly<Record<string, string>> = {
  LuauWhileLoop: "`while` loop",
  LuauSparkdownWhileLoop: "`while` loop",
  LuauForLoop: "`for` loop",
  LuauSparkdownForLoop: "`for` loop",
  LuauSparkdownExplicitLoop: "`for` loop",
};

const REPEAT_LOOPS = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"]);
const BOUNDED_BLOCKS = nodeNameSet([
  "LuauSparkdownExplicitDoBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauSparkdownExplicitLoop",
  "LuauSparkdownExplicitRepeatLoop",
]);

interface Block {
  // The line the diagnostic is reported on: the loop's for a loop's `do`.
  header: SyntaxNode;
  label: string;
  // The keyword that closes the block: `until` for a `repeat`.
  closer: "end" | "until";
  bounded?: boolean;
}

const MISSING_UNTIL =
  "This `repeat` loop is missing its closing `until`. Without it, the lines below it are read as part of this loop, up to the next `scene`, `branch` or the end of the file.";

function asBlock(node: SyntaxNode): Block | null {
  const kind = END_BLOCKS[node.name];
  if (!kind) return null;
  // The nearest enclosing loop, if the block is that loop's body.
  for (let up = node.parent; up && !END_BLOCKS[up.name]; up = up.parent) {
    const loopKind = LOOPS[up.name];
    if (!loopKind) continue;
    const body = loopBodyBlock(up as GrammarSyntaxNode<SparkdownNodeName>);
    if (body?.from === node.from && body.name === node.name) {
      const begin = findChildByName(up, `${up.name}_begin`);
      const label = up.name === "LuauSparkdownExplicitLoop" && begin && getDescendent("LuauWhileKeyword", begin)
        ? "`while` loop" : loopKind;
      return { header: up, label, closer: "end", bounded: BOUNDED_BLOCKS.has(up.name) };
    }
    break;
  }
  return { header: node, label: kind, closer: "end", bounded: BOUNDED_BLOCKS.has(node.name) };
}

function boundedMissingMessage(label: string, closer: "end" | "until"): string {
  return `This ${label} is missing its closing \`${closer}\` keyword on this \`&\` line. The following line remains story text.`;
}

function missingEndMessage(label: string): string {
  return `This ${label} is missing its closing \`end\` keyword. Without it, the lines below it are read as part of this ${label}, up to the next \`scene\`, \`branch\` or the end of the file.`;
}

function report(
  diagnostics: InkDiagnostic[],
  header: SyntaxNode,
  message: string,
  ctx: LowerContext,
  severity = ErrorType.Error,
): void {
  const line = lineTextSpan(header.from, header.to, ctx);
  if (!line) return;
  diagnostics.push({
    message,
    severity,
    source: makeSource(line.from, line.to, ctx),
  });
}

// Whether a walk over siblings or children may step over `node`.
function skippable(node: SyntaxNode): boolean {
  return (
    node.from === node.to || isTrivia(node) || node.name === "ERROR_INCOMPLETE"
  );
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

// How many more `until`s lie inside `repeat` than `repeat` loops nested in it
// to take them.
function untilsLeftInside(repeat: SyntaxNode): number {
  return countDescendants(repeat, UNTIL) - countDescendants(repeat, REPEAT_LOOPS);
}

// Whether the grammar read the loop's own `until` into one of its statements
// (#1092), as in `repeat & local z = 1 until true`, which
// `lowerLuauRepeatLoop` reports. An `until` inside a nested `repeat`, or
// inside a block left without its `end` (which took the `until` and reports
// itself), is not one; an `until` read into a statement inside a closed block
// is.
export function untilReadIntoStatement(repeat: SyntaxNode): boolean {
  if (untilsLeftInside(repeat) <= 0) return false;
  const inStatement = (node: SyntaxNode): boolean => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (UNTIL.has(child.name)) return true;
      if (REPEAT_LOOPS.has(child.name)) continue;
      if (END_BLOCKS[child.name] && !endKeywordOf(child)) continue;
      if (inStatement(child)) return true;
    }
    return false;
  };
  return inStatement(repeat);
}

// Whether the `until`s that follow `repeat` or lie inside it are enough for
// it and the `repeat` loops nested in it. The grammar can end nested loops at
// the same `until` and hang it after the outermost, where Luau gives it to the
// innermost, so the count decides rather than where each `until` sits.
function hasUntil(repeat: SyntaxNode): boolean {
  let next = repeat.nextSibling;
  while (next && skippable(next)) next = next.nextSibling;
  const following = next && UNTIL.has(next.name) ? 1 : 0;
  return following + untilsLeftInside(repeat) > 0;
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
// it are not reported again. A `repeat` cut off at a line the grammar cannot
// read as Luau, whose `until` follows as a root-level chunk of its own, is
// `validateOpenBlocks`'s to check.
//
// A node `skip` names holds no block this checks (`holdsCheckedBlock`), and
// is not walked: a statement served from its memo (#656), which the chunk's
// last lowering found to hold none, as its syntax still does.
export function validateBlockEnds(
  chunk: SyntaxNode,
  ctx: LowerContext,
  skip?: (node: SyntaxNode) => boolean,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const cutOff = new Set(
    openChain(chunk)
      .filter((block) => block.closer === "until")
      .map((block) => block.header.from),
  );
  const visit = (node: SyntaxNode, insideOpenRepeat: boolean) => {
    if (skip?.(node)) return;
    const block = asBlock(node);
    let openRepeat = insideOpenRepeat;
    if (block) {
      if (!endKeywordOf(node) && (block.bounded || findChildByName(node, `${node.name}_end`))) {
        report(diagnostics, block.header, block.bounded
          ? boundedMissingMessage(block.label, "end") : missingEndMessage(block.label), ctx);
      }
    } else if (
      REPEAT_LOOPS.has(node.name) &&
      !insideOpenRepeat &&
      !cutOff.has(node.from) &&
      !hasUntil(node)
    ) {
      openRepeat = true;
      report(diagnostics, node, BOUNDED_BLOCKS.has(node.name)
        ? boundedMissingMessage("`repeat` loop", "until") : MISSING_UNTIL, ctx);
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child, openRepeat);
    }
  };
  visit(chunk, false);
  return diagnostics;
}

// Whether `node` is, or holds, a block `validateBlockEnds` checks: one that
// ends at `end`, or a `repeat` loop. A node that holds none gives it nothing
// to report, whatever stands around it.
export function holdsCheckedBlock(node: SyntaxNode): boolean {
  if (END_BLOCKS[node.name] || REPEAT_LOOPS.has(node.name)) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (holdsCheckedBlock(child)) return true;
  }
  return false;
}

// The blocks a root-level chunk leaves open for later root-level `end`s (or,
// for a `repeat`, `until`s) to close, outermost first. Only a block with no
// `_end` node is open this way, and every such block holds the point where the
// grammar stopped reading it, so they all lie on the path through each node's
// last child that has text. A `repeat` on that path with no `until` of its own is cut off the same way.
function openChain(root: SyntaxNode): Block[] {
  const chain: Block[] = [];
  let node: SyntaxNode | null = root;
  while (node) {
    if (BOUNDED_BLOCKS.has(node.name)) {
      // Its missing closer belongs to this explicit line, never a later
      // root-level end/until. Still descend to any real function body.
    } else if (END_BLOCKS[node.name]) {
      if (findChildByName(node, `${node.name}_end`)) break;
      chain.push(asBlock(node)!);
    } else if (REPEAT_LOOPS.has(node.name) && !hasUntil(node)) {
      // A `repeat` whose `until` the grammar kept inside it is closed, even
      // when a block inside it is not.
      chain.push({ header: node, label: "`repeat` loop", closer: "until" });
    }
    let child: SyntaxNode | null = node.lastChild;
    while (child && skippable(child)) child = child.prevSibling;
    node = child;
  }
  return chain;
}

interface ProseEnd {
  endKeyword: SyntaxNode;
  // The line of text after the keyword.
  rest: string;
}

// A root-level block's `end` keyword, when a line of text continues after the
// keyword on its line. A loop's `end` is its `do` block's, `holder`.
function proseEnd(
  root: SyntaxNode,
  holder: SyntaxNode,
  ctx: LowerContext,
): ProseEnd | null {
  const endKeyword = endKeywordOf(holder);
  if (!endKeyword) return null;
  let next = root.nextSibling;
  while (next && skippable(next) && next.name !== "Newline") {
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
  return { endKeyword, rest };
}

type OpenEntry =
  | { kind: "block"; block: Block }
  // A scene or branch, and the last block an `end` closed while it was open.
  | { kind: "scene" | "branch"; lastClosed?: Block };

// Checks, over the root-level nodes of a whole document, the blocks that
// chunks leave open for a later root-level `end` to close, whether the chunk
// is itself a block or holds one (a function value in a `store`), and warns
// about text after a root-level block's `end`. Each root-level
// `end` closes the innermost block, scene or branch still open, and each
// root-level `until` the innermost `repeat` cut off at such a line. A `branch`
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
      const { header, label, closer } = entry.block;
      report(
        diagnostics,
        header,
        closer === "until" ? MISSING_UNTIL : missingEndMessage(label),
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
    } else if (UNTIL.has(node.name)) {
      // An `until` closes the innermost `repeat` open since the last scene or
      // branch; the blocks opened inside that `repeat` and still open are
      // left without their `end`s.
      let repeat = open.length - 1;
      while (repeat >= 0) {
        const entry = open[repeat]!;
        if (entry.kind !== "block") {
          repeat = -1;
        } else if (entry.block.closer === "until") {
          break;
        } else {
          repeat--;
        }
      }
      if (repeat >= 0) {
        while (open.length > repeat + 1) reportEntry(open.pop()!);
        open.pop();
      }
    } else if (node.name === "LuauEndKeyword") {
      // An `end` cannot close a `repeat`, so a `repeat` still open inside the
      // block it reaches is left without its `until`.
      closeAbove(
        (entry) => entry.kind !== "block" || entry.block.closer !== "until",
      );
      const closed = open.pop();
      // The block an `end` closes, or the one a closing branch recorded, took
      // the `end` of the scene or branch around it if that is left open.
      const took = closed?.kind === "block" ? closed.block : closed?.lastClosed;
      if (took) {
        for (let i = open.length - 1; i >= 0; i--) {
          const entry = open[i]!;
          if (entry.kind !== "block") {
            entry.lastClosed = took;
            break;
          }
        }
      }
    } else {
      for (const block of openChain(node)) {
        open.push({ kind: "block", block });
      }
      // A root-level loop's `end` closes its `do` block, which names the loop.
      const holder = LOOPS[node.name]
        ? loopBodyBlock(node as GrammarSyntaxNode<SparkdownNodeName>)
        : node;
      const block = holder ? asBlock(holder) : null;
      const prose = block && holder ? proseEnd(node, holder, ctx) : null;
      if (block && prose) {
        report(
          diagnostics,
          prose.endKeyword,
          `The text after this \`end\`, \`${prose.rest}\`, is read as a line of story text, not as code. If this \`end\` is a word in that line, the ${block.label} above it has no closing \`end\` keyword of its own.`,
          ctx,
          ErrorType.Warning,
        );
      }
    }
  }
  closeAbove(() => false);
  return diagnostics;
}

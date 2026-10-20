import { type SyntaxNode } from "@lezer/common";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
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
// A `repeat` loop closes at `until`, never at `end`, and takes its `until`
// into its `_end` node as a block takes its `end`, so it is checked against
// its own node alone. A `repeat` nested in another takes the first `until`,
// so the loop left open is the outer one, as Luau reports it.

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

// The `until` keyword inside a `repeat` loop's `_end` node, if it has one.
export function untilKeywordOf(repeat: SyntaxNode): SyntaxNode | null {
  const endNode = findChildByName(repeat, `${repeat.name}_end`);
  if (!endNode || endNode.from === endNode.to) return null;
  const keyword = getDescendent("LuauUntilKeyword", endNode);
  return keyword && keyword.to <= endNode.to ? keyword : null;
}

// Whether a `repeat` loop took its `until`, as a block takes its `end`.
function hasUntil(repeat: SyntaxNode): boolean {
  return untilKeywordOf(repeat) !== null;
}

// The `end` keyword inside a block's `_end` node, if it has one.
function endKeywordOf(node: SyntaxNode): SyntaxNode | null {
  const endNode = findChildByName(node, `${node.name}_end`);
  if (!endNode || endNode.from === endNode.to) return null;
  const keyword = getDescendent("LuauEndKeyword", endNode);
  return keyword && keyword.to <= endNode.to ? keyword : null;
}

// A function body's stray `else`, `elseif` or `until` is a closer no block
// owns.
const CLOSER_KEYWORDS = nodeNameSet(["LuauEndKeyword", "LuauElseKeyword", "LuauElseifKeyword", "LuauUntilKeyword", "LuauStrayCloser"]);

// The story blocks of `END_BLOCKS` and `REPEAT_LOOPS`.
const STORY_BLOCKS = nodeNameSet([
  "LuauSparkdownIfBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownRepeatLoop",
]);

// The node after `node` in the document, past trivia, from the first of its
// following siblings or of its ancestors' that has one; null where only
// the chunk's end follows.
function nextAfter(node: SyntaxNode): SyntaxNode | null {
  for (let at: SyntaxNode | null = node; at; at = at.parent) {
    let next = at.nextSibling;
    while (next && skippable(next)) next = next.nextSibling;
    if (next) return next;
  }
  return null;
}

// The first token of a node that is not trivia, or null for none.
function firstToken(node: SyntaxNode): SyntaxNode | null {
  if (skippable(node)) return null;
  if (!node.firstChild) return node;
  for (let child: SyntaxNode | null = node.firstChild; child; child = child.nextSibling) {
    const token = firstToken(child);
    if (token) return token;
  }
  return null;
}

// Whether the grammar closed a block, with nothing in its `_end`, before a
// closer that is not its own (`own`) and that a Luau block around it holds,
// as an `if` with no `end` before its `repeat`'s `until` (#1209). Luau's
// reading of the chunk reports the block left open at that closer
// (`readLuauAst.ts`), as Luau does, so it is not reported here. A closer
// the chunk does not hold is left to this validator, and so is a story
// block that closed before its `repeat`'s `until`, which keeps the
// validator's own report.
function closedBeforeOuterCloser(node: SyntaxNode, own: ReadonlySet<string>, chunk: SyntaxNode): boolean {
  if (STORY_BLOCKS.has(node.name)) return false;
  const endNode = findChildByName(node, `${node.name}_end`);
  if (!endNode || endNode.from !== endNode.to) return false;
  const next = nextAfter(endNode);
  if (!next || next.to > chunk.to) return false;
  const closer = firstToken(next);
  return !!closer && CLOSER_KEYWORDS.has(closer.name) && !own.has(closer.name);
}

const OWNS_END = nodeNameSet(["LuauEndKeyword"]);
const OWNS_UNTIL = nodeNameSet(["LuauUntilKeyword"]);

// Checks the blocks of one chunk that the chunk's own nodes show to be open:
// those cut off before a `scene` or `branch`, and `repeat` loops with no
// `until`. A `repeat` left open is reported as the outermost of the loops
// left open, as Luau reports it, and the loops inside it are not reported
// again. A `repeat` cut off where its body cannot go on, which a root-level
// `end` after the chunk reaches, is `validateOpenBlocks`'s to check.
//
// A node `skip` names holds no block this checks (`holdsCheckedBlock`), and
// is not walked: a statement served from its memo (#656), which the chunk's
// last lowering found to hold none, as its syntax still does.
export function validateBlockEnds(
  chunk: SyntaxNode,
  ctx: LowerContext,
  skip?: (node: GrammarSyntaxNode<SparkdownNodeName>) => boolean,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const cutOff = new Set(
    openChain(chunk)
      .filter((block) => block.closer === "until")
      .map((block) => block.header.from),
  );
  const visit = (node: SyntaxNode, insideOpenRepeat: boolean) => {
    if (skip?.(node as GrammarSyntaxNode<SparkdownNodeName>)) return;
    const block = asBlock(node);
    let openRepeat = insideOpenRepeat;
    if (block) {
      if (
        !endKeywordOf(node) &&
        (block.bounded || findChildByName(node, `${node.name}_end`)) &&
        !closedBeforeOuterCloser(node, OWNS_END, chunk)
      ) {
        report(diagnostics, block.header, block.bounded
          ? boundedMissingMessage(block.label, "end") : missingEndMessage(block.label), ctx);
      }
    } else if (
      REPEAT_LOOPS.has(node.name) &&
      !insideOpenRepeat &&
      !cutOff.has(node.from) &&
      !hasUntil(node) &&
      // As for a block above: a loop the grammar closed before a closer of
      // a block around it (`repeat … end`) is Luau's reading's to report.
      (BOUNDED_BLOCKS.has(node.name) || findChildByName(node, `${node.name}_end`)) &&
      !closedBeforeOuterCloser(node, OWNS_UNTIL, chunk)
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
export function holdsCheckedBlock(node: GrammarSyntaxNode<SparkdownNodeName>): boolean {
  if (END_BLOCKS[node.name] || REPEAT_LOOPS.has(node.name)) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (holdsCheckedBlock(child as GrammarSyntaxNode<SparkdownNodeName>)) return true;
  }
  return false;
}

// The blocks a root-level chunk leaves open for later root-level `end`s to
// close, outermost first. Only a block with no `_end` node is open this way,
// and every such block holds the point where the grammar stopped reading it,
// so they all lie on the path through each node's last child that has text.
// A `repeat` on that path with no `until` of its own is cut off the same way,
// and an `end` that reaches it leaves it without its `until`.
function openChain(root: SyntaxNode): Block[] {
  const chain: Block[] = [];
  let node: SyntaxNode | null = root;
  while (node) {
    if (BOUNDED_BLOCKS.has(node.name)) {
      // Its missing closer belongs to this explicit line, never a later
      // root-level end. Still descend to any real function body.
    } else if (END_BLOCKS[node.name]) {
      if (findChildByName(node, `${node.name}_end`)) break;
      chain.push(asBlock(node)!);
    } else if (REPEAT_LOOPS.has(node.name) && !hasUntil(node)) {
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
// `end` closes the innermost block, scene or branch still open; no
// root-level `until` closes a `repeat`, since only a loop's own end reads
// `until` (`LuauRepeatLoop`). A `branch`
// sets aside every block still open before it, and a `scene` or the end of
// the document every block, scene and branch. Scenes and branches take part
// so that their own `end`s are not counted as a block's: one left open after
// a block inside it took an `end` is reported on that block, and one no block
// took an `end` from is `validateSceneBranchScope.ts`'s to report. An `end`
// with nothing open to close is reported on itself.
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
    } else if (node.name === "LuauEndKeyword") {
      // An `end` cannot close a `repeat`, so a `repeat` still open inside the
      // block it reaches is left without its `until`.
      closeAbove(
        (entry) => entry.kind !== "block" || entry.block.closer !== "until",
      );
      const closed = open.pop();
      // An `end` that closes nothing is reported on itself, as Luau reports
      // one (#774): an extra `end` after a function, or the second `end` of
      // an if statement written where an if expression is read, whose first
      // `end` closed the function early.
      if (!closed) report(diagnostics, node, "Expected <eof>, got 'end'", ctx);
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

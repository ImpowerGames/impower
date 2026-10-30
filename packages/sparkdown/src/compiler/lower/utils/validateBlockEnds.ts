import { type SyntaxNode } from "@lezer/common";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { enclosingUnclosedIslandEnd } from "../../utils/storyIslands";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { loopBodyBlock } from "./loopDoBlock";
import { isTrivia, lineTextSpan, makeSource } from "./validateDefineStructure";
import { isLuauDocument, luauReadingReportsAllAt } from "../../typecheck/LuauUnitNodes";

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
  header: SyntaxNode;
  label: string;
  closer: "end" | "until";
  bounded?: boolean;
}

const MISSING_UNTIL =
  "This `repeat` loop is missing its closing `until`. Without it, the lines below it are read as part of this loop, up to the next `scene`, `branch` or the end of the file.";

function asBlock(node: SyntaxNode): Block | null {
  const kind = END_BLOCKS[node.name];
  if (!kind) return null;
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

function luauReportsOpenBlock(ctx: LowerContext): boolean {
  return ctx.filePath !== undefined && isLuauDocument(ctx.filePath);
}

function luauReportsOpenBlockAt(header: SyntaxNode, ctx: LowerContext): boolean {
  if (luauReportsOpenBlock(ctx) || luauReadingReportsAllAt(header, (from, to) => ctx.read(from, to))) return true;
  const text = ctx.documentText?.();
  return text !== undefined && enclosingUnclosedIslandEnd(header, text) !== undefined;
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

function skippable(node: SyntaxNode): boolean {
  return (
    node.from === node.to || isTrivia(node) || node.name === "ERROR_INCOMPLETE"
  );
}

export function untilKeywordOf(repeat: SyntaxNode): SyntaxNode | null {
  const endNode = findChildByName(repeat, `${repeat.name}_end`);
  if (!endNode || endNode.from === endNode.to) return null;
  const keyword = getDescendent("LuauUntilKeyword", endNode);
  return keyword && keyword.to <= endNode.to ? keyword : null;
}

function hasUntil(repeat: SyntaxNode): boolean {
  return untilKeywordOf(repeat) !== null;
}

function endKeywordOf(node: SyntaxNode): SyntaxNode | null {
  const endNode = findChildByName(node, `${node.name}_end`);
  if (!endNode || endNode.from === endNode.to) return null;
  const keyword = getDescendent("LuauEndKeyword", endNode);
  return keyword && keyword.to <= endNode.to ? keyword : null;
}

const CLOSER_KEYWORDS = nodeNameSet(["LuauEndKeyword", "LuauElseKeyword", "LuauElseifKeyword", "LuauUntilKeyword", "LuauStrayCloser"]);

const STORY_BLOCKS = nodeNameSet([
  "LuauSparkdownIfBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownRepeatLoop",
]);

function nextAfter(node: SyntaxNode): SyntaxNode | null {
  for (let at: SyntaxNode | null = node; at; at = at.parent) {
    let next = at.nextSibling;
    while (next && skippable(next)) next = next.nextSibling;
    if (next) return next;
  }
  return null;
}

function firstToken(node: SyntaxNode): SyntaxNode | null {
  if (skippable(node)) return null;
  if (!node.firstChild) return node;
  for (let child: SyntaxNode | null = node.firstChild; child; child = child.nextSibling) {
    const token = firstToken(child);
    if (token) return token;
  }
  return null;
}

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
        !closedBeforeOuterCloser(node, OWNS_END, chunk) &&
        !luauReportsOpenBlockAt(block.header, ctx)
      ) {
        report(diagnostics, block.header, block.bounded
          ? boundedMissingMessage(block.label, "end") : missingEndMessage(block.label), ctx);
      }
    } else if (
      REPEAT_LOOPS.has(node.name) &&
      !insideOpenRepeat &&
      !cutOff.has(node.from) &&
      !hasUntil(node) &&
      (BOUNDED_BLOCKS.has(node.name) || findChildByName(node, `${node.name}_end`)) &&
      !closedBeforeOuterCloser(node, OWNS_UNTIL, chunk)
    ) {
      openRepeat = true;
      if (!luauReportsOpenBlockAt(node, ctx)) report(diagnostics, node, BOUNDED_BLOCKS.has(node.name)
        ? boundedMissingMessage("`repeat` loop", "until") : MISSING_UNTIL, ctx);
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child, openRepeat);
    }
  };
  visit(chunk, false);
  return diagnostics;
}

export function holdsCheckedBlock(node: GrammarSyntaxNode<SparkdownNodeName>): boolean {
  if (END_BLOCKS[node.name] || REPEAT_LOOPS.has(node.name)) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (holdsCheckedBlock(child as GrammarSyntaxNode<SparkdownNodeName>)) return true;
  }
  return false;
}

function openChain(root: SyntaxNode): Block[] {
  const chain: Block[] = [];
  let node: SyntaxNode | null = root;
  while (node) {
    if (BOUNDED_BLOCKS.has(node.name)) {
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
  rest: string;
}

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
  | { kind: "scene" | "branch"; lastClosed?: Block };

export function validateOpenBlocks(
  top: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const open: OpenEntry[] = [];
  const reportEntry = (entry: OpenEntry) => {
    if (entry.kind === "block") {
      const { header, label, closer } = entry.block;
      if (luauReportsOpenBlockAt(header, ctx)) return;
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
  const closeAbove = (keep: (entry: OpenEntry) => boolean) => {
    while (open.length > 0 && !keep(open.at(-1)!)) {
      reportEntry(open.pop()!);
    }
  };
  let afterStrayCloser = false;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (node.name === "LuauStrayUntilStatement" && open.length === 0) afterStrayCloser = true;
    else if (node.name !== "LuauEndKeyword" && !isTrivia(node)) afterStrayCloser = false;
    if (node.name === "Scene") {
      closeAbove(() => false);
      open.push({ kind: "scene" });
    } else if (node.name === "Branch") {
      closeAbove((entry) => entry.kind === "scene");
      open.push({ kind: "branch" });
    } else if (node.name === "LuauEndKeyword") {
      if (open.length === 0 && !luauReportsOpenBlock(ctx) && !afterStrayCloser) report(diagnostics, node, "Expected <eof>, got 'end'", ctx);
      if (open.length === 0) afterStrayCloser = true;
      closeAbove(
        (entry) => entry.kind !== "block" || entry.block.closer !== "until",
      );
      const closed = open.pop();
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
      const holder = LOOPS[node.name]
        ? loopBodyBlock(node as GrammarSyntaxNode<SparkdownNodeName>)
        : node;
      const block = holder ? asBlock(holder) : null;
      const prose = block && holder && !luauReportsOpenBlock(ctx) ? proseEnd(node, holder, ctx) : null;
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

import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import {
  FUNCTION_CALL_SHORTHAND_NODES,
  ifClauseValueNodes,
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
  reportInlineIfReading,
} from "../expression/lowerExpression";
import {
  buildDivert,
  divertLoadShapeProblem,
  withDivertLoad,
} from "../utils/buildDivert";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import {
  buildDisplayCall,
  buildLoadCall,
  buildUnjoinedWarning,
  separateTags,
} from "../utils/displayCall";
import { lowerTagContent } from "../utils/lowerTagContent";
import { forwardBlockDiagnostics } from "../utils/unwrapBlock";
import { wrapInWeave } from "../utils/wrapInWeave";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerSparkdownConditionalAlternatorBlock";
import { opensAlternator } from "../../utils/alternatorDecision";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerSparkdownSequentialAlternatorBlock";

function buildDisplayCalls(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
  lineType: string,
  identifier: string | null,
): ParsedObject[] {
  const leads = statementLeads(parent, ctx);
  const isContinuation = leads && lineType === "action";
  let target: string | undefined;
  let character: string | undefined;
  if (isContinuation) {
    target = undefined;
    character = undefined;
  } else if (lineType === "dialogue") {
    target = "dialogue";
    character = identifier ?? undefined;
  } else if (lineType === "write") {
    target = identifier || undefined;
    character = undefined;
  } else {
    target = lineType;
    character = undefined;
  }

  let joined: ReturnType<typeof lexicalRouting> | undefined;
  const joinedRouting = () => {
    if (joined === undefined) {
      joined = lexicalRouting(parent, ctx);
      ctx.recordRead?.({
        kind: "routing",
        value: JSON.stringify(joined),
        node: parent.name,
        from: parent.from,
      });
    }
    return joined;
  };
  const ranges = splitBodyRangeAtBreaks(parent, bodyStart, bodyEnd, ctx, mode);
  if (ranges.length === 1 && !ranges[0]!.pause && !ranges[0]!.leads && !leads) {
    const only = soleExpressionSegment(parent, ranges[0]!, ctx);
    const conditional =
      only &&
      tryLowerInlineConditional(only, ctx, (body) => [
        buildDisplayCall(target, character, body, ranges[0]!, ctx),
      ]);
    if (conditional) {
      reportInlineIfReading(only!, ctx);
      return [conditional];
    }
  }
  const calls: ParsedObject[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    const divertTail = { objects: [] as ParsedObject[], bodyIndex: -1 };
    const walked = processDisplayBody(parent, range.from, range.to, ctx, mode, {
      divertTail,
    });
    const { tags, rest: body } = separateTags(walked);
    if (divertTail.bodyIndex >= 0) {
      const before = separateTags(walked.slice(0, divertTail.bodyIndex)).rest;
      body.splice(before.length);
    }
    let beatLeads = (i === 0 && leads) || range.leads;
    if (body[0] instanceof LeadMark) {
      body.shift();
      beatLeads = true;
    }
    let end = body.length;
    while (end > 0) {
      const last = body[end - 1];
      if (!(last instanceof Text) || last.text.trim()) break;
      end--;
    }
    const trailingGlue = body[end - 1] instanceof GlueMark ? body[end - 1] : null;
    if (trailingGlue) body.splice(end - 1);
    for (const mark of joinMidBodyGlue(body)) {
      calls.push(buildUnjoinedWarning(mark, ctx));
    }
    const divertJoins =
      divertTail.objects.length > 0 &&
      divertTail.objects.every(
        (obj) => obj instanceof Divert || obj instanceof TunnelOnwards,
      );
    const firstContent = body.findIndex(
      (part) => !(part instanceof Text) || part.text.trim().length > 0,
    );
    const loadArgs = lineType === "action" && body[firstContent] instanceof LoadMark
      ? body.slice(firstContent + 1) : null;
    if (loadArgs) {
      if (trailingGlue) {
        reportLoadGlue(parent, range, ctx);
        const last = loadArgs.at(-1);
        if (last instanceof Text) {
          loadArgs[loadArgs.length - 1] = new Text(last.text.trimEnd());
        }
      }
      calls.push(
        buildLoadCall(loadArgs, range, ctx, tags, { open: divertJoins }),
      );
    } else {
      const stamped =
        body.length > 0 || range.pause || ranges.length > 1
          ? range
          : { from: parent.from, to: parent.from };
      calls.push(
        buildDisplayCall(
          isContinuation && i > 0 ? joinedRouting()?.target : target,
          isContinuation && i > 0 ? joinedRouting()?.character : character,
          body,
          stamped,
          ctx,
          tags,
          {
            pause: range.pause,
            extend: trailingGlue != null && range.pause,
            glue: trailingGlue != null && !range.pause && !divertJoins,
            group: isContinuation
              ? `${ctx.filePath ?? ""}#${parent.from}`
              : undefined,
            inherit: isContinuation && i > 0,
            open: divertJoins,
            continues: beatLeads,
          },
        ),
      );
    }
    if (divertTail.objects.length > 0) {
      calls.push(...divertTail.objects);
      calls.push(new Text("\n"));
    }
  }
  return calls;
}

function soleExpressionSegment(
  parent: SyntaxNode,
  range: { from: number; to: number },
  ctx: LowerContext,
): SyntaxNode | null {
  const segments = collectBodySegments(parent, range.from, range.to, ctx).filter(
    (seg) => !(seg.kind === "text" && seg.raw.trim().length === 0),
  );
  const only = segments.length === 1 ? segments[0]! : null;
  return only?.kind === "expr" ? only.node : null;
}

class GlueMark extends ParsedObject {
  protected override Prepare(): boolean {
    return false;
  }
}

class LeadMark extends ParsedObject {
  protected override Prepare(): boolean {
    return false;
  }

  constructor(public readonly range: { from: number; to: number }) {
    super();
  }
}

class LoadMark extends Text {}

function joinMidBodyGlue(
  body: ParsedObject[],
): { from: number; to: number }[] {
  const unjoined: { from: number; to: number }[] = [];
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i] instanceof LeadMark) {
      let before = i - 1;
      while (isBlankText(body[before])) before--;
      if (body[before] instanceof GlueMark) {
        body.splice(before, i - before + 1);
        i = before;
      } else {
        unjoined.unshift((body[i] as LeadMark).range);
        body.splice(i, 1);
      }
    } else if (body[i] instanceof GlueMark) {
      body.splice(i, 1);
      let next = i;
      while (body[next] instanceof Text && /^[ \t]*$/.test((body[next] as Text).text)) {
        next++;
      }
      const after = body[next];
      if (after instanceof Text && /^[ \t]*\n/.test(after.text)) {
        body.splice(i, next - i, new Text(after.text.replace(/^[ \t]+/, "")));
        body.splice(i + 1, 1);
        const prev = body[i - 1];
        if (prev instanceof Text) {
          body[i - 1] = new Text(prev.text.replace(/[ \t]+$/, ""));
        }
      }
    }
  }
  return unjoined;
}

function isBlankText(obj: ParsedObject | undefined): boolean {
  return obj instanceof Text && !/[^ \t\n]/.test(obj.text);
}

function splitBodyRangeAtBreaks(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
): BeatRange[] {
  const breaks = collectBreaksInRange(parent, bodyStart, bodyEnd);
  const ranges: BeatRange[] = [];
  let segStart = bodyStart;
  let leads = false;
  for (const brk of breaks) {
    const newline = ctx.read(brk.to, bodyEnd).indexOf("\n");
    const lineEnd = newline < 0 ? bodyEnd : brk.to + newline;
    const endsLine =
      !hasBodyContent(parent, brk.to, lineEnd, ctx) &&
      !breaks.some((other) => other.from >= brk.to && other.from < lineEnd);
    const to = endsLine
      ? ctx.read(lineEnd - 1, lineEnd) === "\r"
        ? lineEnd - 1
        : lineEnd
      : brk.from;
    ranges.push({ from: segStart, to, pause: true, leads });
    if (endsLine) {
      segStart = Math.min(lineEnd + 1, bodyEnd);
      leads = false;
      continue;
    }
    const mark = collectTopLevelInjections(parent, brk.to, lineEnd)
      .find((injection) => injection.kind === "leadingGlue" && injection.from === brk.to);
    segStart = brk.to;
    leads = mark != null;
  }
  ranges.push({ from: segStart, to: bodyEnd, pause: false, leads });
  const kept = ranges.filter(
    (range, i) =>
      hasBodyContent(parent, range.from, range.to, ctx) ||
      (mode === "inline" && i < ranges.length - 1),
  );
  return kept.length > 0
    ? kept
    : [{ from: bodyStart, to: bodyEnd, pause: false, leads: false }];
}

interface BeatRange {
  from: number;
  to: number;
  pause: boolean;
  leads: boolean;
}

const BODY_MARKS: ReadonlySet<BodyInjection["kind"]> = new Set([
  "tag",
  "comment",
  "break",
  "glue",
  "leadingGlue",
]);

function hasBodyContent(
  parent: SyntaxNode,
  from: number,
  to: number,
  ctx: LowerContext,
  marks: ReadonlySet<BodyInjection["kind"]> = BODY_MARKS,
): boolean {
  let pos = from;
  for (const injection of collectTopLevelInjections(parent, from, to)) {
    if (!marks.has(injection.kind)) continue;
    if (injection.from > pos && ctx.read(pos, injection.from).trim()) {
      return true;
    }
    pos = Math.max(pos, injection.to);
  }
  return pos < to && ctx.read(pos, to).trim().length > 0;
}

function collectBreaksInRange(
  parent: SyntaxNode,
  from: number,
  to: number,
): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.to <= from || node.from >= to) return;
    if (node !== parent && node.name === "Break") {
      out.push(node);
      return;
    }
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  };
  visit(parent);
  out.sort((a, b) => a.from - b.from);
  return out;
}

type BodySegment =
  | { kind: "text"; raw: string; start: number }
  | { kind: "load"; node: SyntaxNode }
  | { kind: "expr"; node: SyntaxNode }
  | { kind: "divert"; node: SyntaxNode }
  | { kind: "inlineGluedAlt"; node: SyntaxNode }
  | { kind: "tag"; node: SyntaxNode }
  | { kind: "glue" }
  | { kind: "lead"; from: number; to: number };

const INLINE_GLUED_ALTERNATOR_NAMES = nodeNameSet([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

function processDisplayBody(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
  options: {
    divertTail: { objects: ParsedObject[]; bodyIndex: number };
  },
): ParsedObject[] {
  let segments = collectBodySegments(parent, bodyStart, bodyEnd, ctx);

  if (mode === "block") {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (seg.kind === "text") {
        const startsSourceLine =
          seg.start <= 0 || ctx.read(seg.start - 1, seg.start) === "\n";
        seg.raw = seg.raw
          .split(/\r?\n/)
          .map((line, lineIndex) =>
            lineIndex === 0 && !startsSourceLine
              ? line
              : line.replace(/^[ \t]+/, ""),
          )
          .join("\n");
      }
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === "text") {
      last.raw = last.raw.replace(/\n+$/, "");
    }
  } else {
    const first = segments[0];
    if (first && first.kind === "text") {
      first.raw = first.raw.replace(/^\s+/, "");
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === "text") {
      last.raw = last.raw.replace(/\s+$/, "");
    } else if (last?.kind === "load") {
      segments[segments.length - 1] = {
        kind: "text",
        raw: ctx.read(last.node.from, last.node.to).trimEnd(),
        start: last.node.from,
      };
    }
  }

  segments = segments.filter((s) => !(s.kind === "text" && s.raw.length === 0));

  const out: ParsedObject[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "text") {
      const text = applyDisplayEscapes(seg.raw);
      if (text.length > 0) out.push(new Text(text));
    } else if (seg.kind === "load") {
      out.push(new LoadMark(ctx.read(seg.node.from, seg.node.to)));
    } else if (seg.kind === "glue") {
      out.push(new GlueMark());
    } else if (seg.kind === "lead") {
      out.push(new LeadMark({ from: seg.from, to: seg.to }));
    } else if (seg.kind === "inlineGluedAlt") {
      const lowered =
        seg.node.name === "LuauSparkdownInlineGluedSequentialAlternatorBlock"
          ? lowerSparkdownSequentialAlternatorBlock(
              makeAltNodeRef(seg.node),
              ctx,
            )
          : lowerSparkdownConditionalAlternatorBlock(
              makeAltNodeRef(seg.node),
              ctx,
            );
      forwardBlockDiagnostics(lowered, ctx);
      if (lowered.content) {
        for (const obj of lowered.content) out.push(obj);
      }
    } else if (seg.kind === "tag") {
      appendDisplayTags(seg.node, ctx, out);
    } else if (seg.kind === "expr") {
      const inlineCond = tryLowerInlineConditional(seg.node, ctx);
      if (inlineCond) {
        reportInlineIfReading(seg.node, ctx);
        out.push(inlineCond);
      } else {
        const inlineAlt = tryLowerInlineAlternator(seg.node, ctx);
        if (inlineAlt) {
          for (const obj of inlineAlt) out.push(obj);
        } else {
          const expr = lowerExpressionFromContainer(seg.node, ctx, "expression");
          if (expr) {
            expr.outputWhenComplete = true;
            out.push(expr);
          }
        }
      }
    } else {
      const divertObjects = buildDivert(seg.node, ctx);
      const loadProblem = divertLoadShapeProblem(seg.node);
      if (loadProblem && ctx.diagnostics) {
        ctx.diagnostics.push({
          message: loadProblem,
          severity: ErrorType.Warning,
          source: {
            fileName: null,
            filePath: ctx.filePath ?? null,
            startLineNumber: ctx.lineNumber(seg.node.from) + 1,
            endLineNumber: ctx.lineNumber(seg.node.to) + 1,
            startCharacterNumber: ctx.characterNumber(seg.node.from) + 1,
            endCharacterNumber: ctx.characterNumber(seg.node.to) + 1,
          },
        });
      }
      const tail = options.divertTail;
      tail.bodyIndex = out.length;
      tail.objects.push(
        ...withDivertLoad(seg.node, divertObjects, ctx, { ownLine: false }),
      );
    }
  }
  return out;
}

function collectBodySegments(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
): BodySegment[] {
  const injections = collectTopLevelInjections(parent, bodyStart, bodyEnd);
  const out: BodySegment[] = [];
  let textBuf = "";
  let textStart = bodyStart;
  let i = bodyStart;
  let idx = 0;

  const flush = () => {
    if (textBuf.length > 0) {
      out.push({ kind: "text", raw: textBuf, start: textStart });
      textBuf = "";
    }
  };

  while (i < bodyEnd) {
    const next = injections[idx];
    if (next && next.from === i && next.kind === "break") {
      idx++;
      i = next.to;
      const after = injections[idx];
      if (after && after.kind === "glue" && after.from === next.to) {
        idx++;
        i = after.to;
      }
      continue;
    }
    if (next && next.from === i && next.kind === "leadingGlue") {
      idx++;
      if (next.from !== bodyStart && !startsItsLine(next.node, ctx)) continue;
      flush();
      out.push({ kind: "lead", from: next.from, to: next.to });
      i = next.to;
      while (i < bodyEnd && /[ \t]/.test(ctx.read(i, i + 1))) i++;
      continue;
    }
    if (next && next.from === i) {
      flush();
      if (next.kind === "load") {
        out.push({ kind: "load", node: next.node });
      } else if (next.kind === "expr") {
        out.push({ kind: "expr", node: next.node });
      } else if (next.kind === "divert") {
        out.push({ kind: "divert", node: next.node });
      } else if (next.kind === "tag") {
        out.push({ kind: "tag", node: next.node });
      } else if (next.kind === "glue") {
        out.push({ kind: "glue" });
      } else if (next.kind === "comment") {
        const wholeLine =
          next.from <= bodyStart || ctx.read(next.from - 1, next.from) === "\n";
        i = next.to;
        if (wholeLine && i < bodyEnd && ctx.read(i, i + 1) === "\n") {
          i++;
        }
        idx++;
        continue;
      } else {
        out.push({ kind: "inlineGluedAlt", node: next.node });
      }
      i = next.to;
      idx++;
      continue;
    }
    if (next && next.from < i) {
      idx++;
      continue;
    }
    if (textBuf.length === 0) textStart = i;
    textBuf += ctx.read(i, i + 1);
    i++;
  }
  flush();
  return out;
}

interface BodyInjection {
  kind:
    | "load"
    | "expr"
    | "divert"
    | "inlineGluedAlt"
    | "tag"
    | "comment"
    | "glue"
    | "leadingGlue"
    | "break";
  node: SyntaxNode;
  from: number;
  to: number;
}

function collectTopLevelInjections(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
): BodyInjection[] {
  const out: BodyInjection[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.to <= bodyStart || node.from >= bodyEnd) return;
    if (node !== parent) {
      if (node.name === "DisplayLoadKeyword") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "load", node, from: node.from, to: node.to });
        }
        return;
      }
      if (node.name === "LuauInterpolatedString") return;
      if (
        isExplicitRuleName(node.name, "LuauInterpolatedStringExpression") ||
        isExplicitRuleName(node.name, "LuauFunctionCallShorthand")
      ) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "expr", node, from: node.from, to: node.to });
        }
        return;
      }
      if (node.name === "Divert") {
        const mark = getDescendent("DivertMark", node);
        const from = mark ? mark.from : node.from;
        if (from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "divert", node, from, to: node.to });
        }
        return;
      }
      if (INLINE_GLUED_ALTERNATOR_NAMES.has(node.name)) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          const beginNode = findChildByNameDirect(node, `${node.name}_begin`);
          const openingGlue = beginNode
            ? getDescendent("AlternatorGlue", beginNode)
            : null;
          const from = openingGlue ? openingGlue.from : node.from;
          out.push({ kind: "inlineGluedAlt", node, from, to: node.to });
        }
        return;
      }
      if (isExplicitRuleName(node.name, "Tags")) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "tag", node, from: node.from, to: node.to });
        }
        return;
      }
      if (
        node.name === "SparkdownLineComment" ||
        node.name === "SparkdownInlineComment"
      ) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "comment", node, from: node.from, to: node.to });
        }
        return;
      }
      if (node.name === "Glue") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "glue", node, from: node.to - 2, to: node.to });
        }
        return;
      }
      if (node.name === "LeadingGlue") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "leadingGlue", node, from: node.from, to: node.to });
        }
        return;
      }
      if (node.name === "Break") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "break", node, from: node.from, to: node.to });
        }
        return;
      }
    }
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  };
  visit(parent);
  out.sort((a, b) => a.from - b.from);
  return out;
}

function applyDisplayEscapes(raw: string): string {
  const input = raw.replace(/\r\n?/g, "\n");
  let out = "";
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === "\\") {
      const next = input[i + 1];
      if (next === undefined) {
        out += "\\";
        i++;
      } else if (next === " " || next === "\t" || next === "\n") {
        out += "\n";
        i += 2;
        while (i < input.length && (input[i] === " " || input[i] === "\t")) {
          i++;
        }
      } else {
        out += "\\" + next;
        i += 2;
      }
    } else if (c === "\n") {
      out += "\n";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function appendDisplayTags(
  tagsNode: SyntaxNode,
  ctx: LowerContext,
  out: ParsedObject[],
): void {
  const contentNode =
    findChildByNameDirect(tagsNode, "Tags_content") ?? tagsNode;
  let child = contentNode.firstChild;
  while (child) {
    if (isExplicitRuleName(child.name, "Tag")) {
      out.push(new Tag(true));
      const tagContent = getDescendent(["TagContent", "SparkdownExplicitTagContent"], child);
      if (tagContent) {
        for (const obj of lowerTagContent(tagContent, ctx)) {
          out.push(obj);
        }
      }
      out.push(new Tag(false));
    }
    child = child.nextSibling;
  }
}

function extractInlineBodyRange(nodeRef: SparkdownSyntaxNodeRef): {
  from: number;
  to: number;
} {
  const colon = getDescendent(
    ["ColonSeparator", "ColonOperator"],
    nodeRef.node,
  );
  const glue = leadingGlue(nodeRef.node);
  if (glue) return { from: glue.to, to: nodeRef.to };
  if (colon) return { from: colon.to, to: nodeRef.to };
  return { from: nodeRef.from, to: nodeRef.to };
}

function leadingGlue(node: SyntaxNode): SyntaxNode | null {
  const begin = findChildByNameDirect(node, `${node.name}_begin`);
  return (begin && getDescendent("LeadingGlue", begin)) ?? null;
}

function statementLeads(node: SyntaxNode, ctx: LowerContext): boolean {
  const glue = leadingGlue(node);
  if (glue) return !ACTION_STATEMENTS.has(node.name) || beginsItsText(glue, ctx);
  if (!BLOCK_STATEMENTS.has(node.name)) return false;
  const body = extractBlockBodyRange(makeAltNodeRef(node), ctx);
  const first = collectTopLevelInjections(node, body.from, body.to).find(
    (injection) => injection.kind === "leadingGlue",
  );
  return (
    first != null &&
    startsItsLine(first.node, ctx) &&
    !hasBodyContent(node, body.from, first.from, ctx)
  );
}

const BLOCK_STATEMENTS: ReadonlySet<string> = nodeNameSet([
  "BlockAction",
  "BlockDialogue",
  "BlockHeading",
  "BlockTitle",
  "BlockTransitional",
  "BlockWrite",
]);

function startsItsLine(node: SyntaxNode, ctx: LowerContext): boolean {
  const column = ctx.characterNumber(node.from);
  return !ctx.read(node.from - column, node.from).trim();
}

function beginsItsText(node: SyntaxNode, ctx: LowerContext): boolean {
  const column = ctx.characterNumber(node.from);
  return /^[ \t]*(?:\|[ \t]*)?$/.test(ctx.read(node.from - column, node.from));
}

interface LineEndMarks {
  breaks: SyntaxNode[];
  glue: boolean;
  extend: boolean;
  spaces: string;
  tags: SyntaxNode[];
}

function lineEndMarks(
  node: SyntaxNode,
  ctx: LowerContext,
): LineEndMarks | null {
  if (node.name !== "InlineAction" && node.name !== "ImplicitAction") {
    return null;
  }
  let prev = node.prevSibling;
  while (prev && ADJACENT_WHITESPACE.has(prev.name)) prev = prev.prevSibling;
  if (
    !prev ||
    (!isExplicitRuleName(prev.name, "LuauInterpolatedStringExpression") &&
      !isExplicitRuleName(prev.name, "LuauFunctionCallShorthand")) ||
    startsItsLine(node, ctx)
  ) {
    return null;
  }
  const marks: LineEndMarks = {
    breaks: [],
    glue: false,
    extend: false,
    spaces: "",
    tags: [],
  };
  let pos = node.from;
  let glue = false;
  for (const injection of collectTopLevelInjections(node, node.from, node.to)) {
    if (ctx.read(pos, injection.from).trim()) return null;
    if (injection.kind === "break") {
      marks.breaks.push(injection.node);
      marks.extend = glue;
      glue = false;
    } else if (injection.kind === "glue" || injection.kind === "leadingGlue") {
      if (marks.breaks.length === 0) {
        glue = true;
        marks.spaces = ctx.read(prev.to, injection.from);
      }
    } else if (injection.kind === "tag") {
      marks.tags.push(injection.node);
    } else if (injection.kind !== "comment") {
      return null;
    }
    pos = Math.max(pos, injection.to);
  }
  if (ctx.read(pos, node.to).trim()) return null;
  marks.glue = glue && marks.breaks.length === 0;
  return marks.breaks.length > 0 || marks.glue ? marks : null;
}

const ACTION_STATEMENTS: ReadonlySet<string> = nodeNameSet([
  "ImplicitAction",
  "InlineAction",
  "BlockAction",
]);

const ADJACENT_WHITESPACE: ReadonlySet<string> = nodeNameSet([
  "Whitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
  "OptionalWhitespace",
]);

const LOAD_GLUE_MESSAGE =
  "A `load` line cannot end with `..`. Name every asset it loads on the line.";

function reportLoadGlue(
  parent: SyntaxNode,
  range: { from: number; to: number },
  ctx: LowerContext,
): void {
  const mark = collectTopLevelInjections(parent, range.from, range.to)
    .filter((injection) => injection.kind === "glue")
    .at(-1);
  if (!mark) return;
  ctx.diagnostics?.push({
    message: LOAD_GLUE_MESSAGE,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(mark.from) + 1,
      endLineNumber: ctx.lineNumber(mark.to) + 1,
      startCharacterNumber: ctx.characterNumber(mark.from) + 1,
      endCharacterNumber: ctx.characterNumber(mark.to) + 1,
    },
  });
}

const DISPLAY_LINE_TYPES: Record<string, string> = {
  InlineDialogue: "dialogue",
  BlockDialogue: "dialogue",
  InlineAction: "action",
  BlockAction: "action",
  ImplicitAction: "action",
  InlineHeading: "heading",
  BlockHeading: "heading",
  InlineTitle: "title",
  BlockTitle: "title",
  InlineTransitional: "transitional",
  BlockTransitional: "transitional",
  InlineWrite: "write",
  BlockWrite: "write",
};

export function continuationRoutingRead(
  node: SyntaxNode,
  ctx: LowerContext,
): string {
  return JSON.stringify(lexicalRouting(node, ctx));
}

function lexicalRouting(
  node: SyntaxNode,
  ctx: LowerContext,
): { target?: string; character?: string } | null {
  let sib = precedingConstruct(node);
  while (sib) {
    const lineType = DISPLAY_LINE_TYPES[sib.name];
    if (!lineType) return null;
    if (lineType === "action" && statementLeads(sib, ctx)) {
      sib = precedingConstruct(sib);
      continue;
    }
    const read = (name: SparkdownNodeName) => {
      const found = getDescendent(name, sib!);
      return found ? ctx.read(found.from, found.to).trim() : undefined;
    };
    if (lineType === "dialogue") {
      return {
        target: "dialogue",
        character: readCue(sib, ctx) || undefined,
      };
    }
    if (lineType === "write") {
      return { target: read("WriteTarget") || undefined };
    }
    return { target: lineType };
  }
  return null;
}

const GLUE_SKIP_SIBLINGS: ReadonlySet<string> = nodeNameSet([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "TrailingWhitespace",
  "SparkdownLineComment",
  "SparkdownInlineComment",
  "Tags",
]);

const BRANCH_OPENERS: ReadonlySet<string> = nodeNameSet([
  "LuauIfBlockCondition",
  "LuauElseifBlockCondition",
  "LuauSparkdownExplicitIfCondition",
  "LuauAlternatorSeparator",
]);

const BRANCH_BODIES: ReadonlySet<string> = nodeNameSet([
  "LuauSparkdownIfBlock_content",
  "LuauSparkdownElseifBlock_content",
  "LuauSparkdownElseBlock_content",
  "LuauSparkdownSequentialAlternatorBlock_content",
  "LuauSparkdownConditionalAlternatorBlock_content",
]);

const BRANCHING_BLOCKS: ReadonlySet<string> = nodeNameSet([
  "LuauSparkdownIfBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownConditionalAlternatorBlock",
]);

function precedingConstruct(node: SyntaxNode): SyntaxNode | null {
  let current = node;
  for (;;) {
    let sib = current.prevSibling;
    while (sib && GLUE_SKIP_SIBLINGS.has(sib.name)) sib = sib.prevSibling;
    if (sib && !BRANCH_OPENERS.has(sib.name)) return sib;
    if (!current.parent || !BRANCH_BODIES.has(current.parent.name)) {
      return null;
    }
    let block: SyntaxNode | null = current.parent;
    while (block && !BRANCHING_BLOCKS.has(block.name)) block = block.parent;
    if (!block) return null;
    current = block;
  }
}

function extractBlockBodyRange(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): { from: number; to: number } {
  const fullText = ctx.read(nodeRef.from, nodeRef.to);
  const firstNewline = fullText.indexOf("\n");
  if (firstNewline === -1) return { from: nodeRef.to, to: nodeRef.to };
  return { from: nodeRef.from + firstNewline + 1, to: nodeRef.to };
}

function readIdentifier(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  name: SparkdownNodeName,
): string | null {
  const node = getDescendent(name, nodeRef.node);
  if (!node) return null;
  return ctx.read(node.from, node.to).trim();
}

function readCue(node: SyntaxNode, ctx: LowerContext): string | null {
  const name = getDescendent("DialogueCharacterName", node);
  if (!name) return null;
  const cue = ctx.read(name.from, name.to).trim();
  const parenthetical = getDescendent("DialogueCharacterParenthetical", node);
  return parenthetical
    ? `${cue} ${ctx.read(parenthetical.from, parenthetical.to).trim()}`
    : cue;
}

export function lowerInlineDialogue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const character = readCue(nodeRef.node, ctx);
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayCalls(
      nodeRef.node,
      from,
      to,
      ctx,
      "inline",
      "dialogue",
      character,
    ),
  );
}

export function lowerImplicitAction(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  if (lineEndMarks(nodeRef.node, ctx)) return {};
  return wrapInWeave(
    buildDisplayCalls(
      nodeRef.node,
      nodeRef.from,
      nodeRef.to,
      ctx,
      "inline",
      "action",
      null,
    ),
  );
}

export function lowerLuauInterpolatedStringExpression(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  if (adjacentInterpolationSibling(nodeRef.node, "prev")) return {};
  const body: ParsedObject[] = [];
  let last: SyntaxNode = nodeRef.node;
  for (
    let node: SyntaxNode | null = nodeRef.node;
    node;
    node = adjacentInterpolationSibling(node, "next")
  ) {
    last = node;
    const alt = tryLowerInlineAlternator(node, ctx);
    if (alt) {
      body.push(...alt);
      continue;
    }
    const expr = lowerExpressionFromContainer(node, ctx, "expression");
    if (expr) {
      expr.outputWhenComplete = true;
      body.push(expr);
    }
  }
  if (body.length === 0) return {};
  let after = last.nextSibling;
  while (after && ADJACENT_WHITESPACE.has(after.name)) after = after.nextSibling;
  const marks = after ? lineEndMarks(after, ctx) : null;
  const tagObjects: ParsedObject[] = [];
  for (const tagsNode of marks?.tags ?? []) {
    appendDisplayTags(tagsNode, ctx, tagObjects);
  }
  const breaks = marks?.breaks ?? [];
  const beats = Math.max(breaks.length, 1);
  const calls: ParsedObject[] = [];
  for (let i = 0; i < beats; i++) {
    const beatBody = i === 0 ? body : [];
    const lastBeat = i === beats - 1;
    if (lastBeat && marks?.spaces) beatBody.push(new Text(marks.spaces));
    calls.push(
      buildDisplayCall(
        undefined,
        undefined,
        beatBody,
        i === 0
          ? { from: nodeRef.node.from, to: last.to }
          : { from: breaks[i]!.from, to: breaks[i]!.to },
        ctx,
        lastBeat ? separateTags(tagObjects).tags : [],
        {
          pause: i < breaks.length,
          extend: lastBeat && marks?.extend,
          glue: lastBeat && marks?.glue,
        },
      ),
    );
  }
  return wrapInWeave(calls);
}

function adjacentInterpolationSibling(
  node: SyntaxNode,
  direction: "prev" | "next",
): SyntaxNode | null {
  const step = (n: SyntaxNode) =>
    direction === "next" ? n.nextSibling : n.prevSibling;
  let cursor: SyntaxNode | null = step(node);
  while (cursor) {
    if (cursor.name === "Newline") return null;
    if (
      isExplicitRuleName(cursor.name, "LuauInterpolatedStringExpression") ||
      isExplicitRuleName(cursor.name, "LuauFunctionCallShorthand")
    ) {
      return cursor;
    }
    if (
      cursor.name === "Whitespace" ||
      cursor.name === "ExtraWhitespace" ||
      cursor.name === "RequiredWhitespace" ||
      cursor.name === "OptionalWhitespace"
    ) {
      cursor = step(cursor);
      continue;
    }
    return null;
  }
  return null;
}

export function lowerInlineAction(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  let { from, to } = extractInlineBodyRange(nodeRef);
  const glue = leadingGlue(nodeRef.node);
  if (lineEndMarks(nodeRef.node, ctx)) return {};
  if (glue && beginsItsText(glue, ctx)) {
    if (!hasBodyContent(nodeRef.node, from, to, ctx)) return {};
  } else if (glue) {
    from = glue.from;
  }
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "inline", "action", null),
  );
}

export function lowerInlineHeading(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "inline", "heading", null),
  );
}

export function lowerInlineTitle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "inline", "title", null),
  );
}

export function lowerInlineTransitional(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayCalls(
      nodeRef.node,
      from,
      to,
      ctx,
      "inline",
      "transitional",
      null,
    ),
  );
}

export function lowerInlineWrite(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const target = readIdentifier(nodeRef, ctx, "WriteTarget");
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "inline", "write", target),
  );
}

export function lowerBlockDialogue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const character = readCue(nodeRef.node, ctx);
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(
      nodeRef.node,
      from,
      to,
      ctx,
      "block",
      "dialogue",
      character,
    ),
  );
}

export function lowerBlockAction(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "block", "action", null),
  );
}

export function lowerBlockHeading(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "block", "heading", null),
  );
}

export function lowerBlockTitle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "block", "title", null),
  );
}

export function lowerBlockTransitional(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(
      nodeRef.node,
      from,
      to,
      ctx,
      "block",
      "transitional",
      null,
    ),
  );
}

export function lowerBlockWrite(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const target = readIdentifier(nodeRef, ctx, "WriteTarget");
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayCalls(nodeRef.node, from, to, ctx, "block", "write", target),
  );
}

function tryLowerInlineAlternator(
  interpNode: SyntaxNode,
  ctx: LowerContext,
): ParsedObject[] | null {
  if (FUNCTION_CALL_SHORTHAND_NODES.has(interpNode.name)) return null;
  const content = findFirstDirectChild(
    interpNode,
    "LuauInterpolatedStringExpression_content",
  );
  const host = content ?? interpNode;
  const seq =
    findFirstDirectChild(host, "LuauSequentialAlternatorBlock") ??
    findFirstDirectChild(host, "LuauSparkdownSequentialAlternatorBlock");
  if (seq && opensAlternator(seq)) {
    const lowered = lowerSparkdownSequentialAlternatorBlock(
      makeAltNodeRef(seq),
      ctx,
    );
    forwardBlockDiagnostics(lowered, ctx);
    return lowered.content ?? null;
  }
  const cond =
    findFirstDirectChild(host, "LuauConditionalAlternatorBlock") ??
    findFirstDirectChild(host, "LuauSparkdownConditionalAlternatorBlock");
  if (cond && opensAlternator(cond)) {
    const lowered = lowerSparkdownConditionalAlternatorBlock(
      makeAltNodeRef(cond),
      ctx,
    );
    forwardBlockDiagnostics(lowered, ctx);
    return lowered.content ?? null;
  }
  return null;
}

function makeAltNodeRef(node: SyntaxNode): SparkdownSyntaxNodeRef {
  return {
    from: node.from,
    to: node.to,
    name: node.name,
    type: node.type,
    node,
  } as unknown as SparkdownSyntaxNodeRef;
}

function tryLowerInlineConditional(
  interpNode: SyntaxNode,
  ctx: LowerContext,
  wrapBranch?: (body: ParsedObject[]) => ParsedObject[],
): Conditional | null {
  if (FUNCTION_CALL_SHORTHAND_NODES.has(interpNode.name)) return null;
  const ifExpr = findFirstDirectChild(interpNode, "LuauTernaryExpression");
  if (!ifExpr) return null;
  const firstCondContent = getDescendent(
    "LuauTernaryExpressionCondition_content",
    ifExpr,
  );
  if (!firstCondContent) return null;

  type Branch = { cond: Expression | null; body: SyntaxNode[] };
  const branches: Branch[] = [];
  const firstCond = lowerExpressionFromContainer(firstCondContent, ctx, null);
  if (!firstCond) return null;
  let current: Branch = { cond: firstCond, body: [] };
  let elseifCondNodes: SyntaxNode[] = [];
  let phase: "wait-then" | "wait-next" | "in-elseif-cond" = "wait-then";

  const isWhitespaceNode = (name: string): boolean =>
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "Newline";

  const ifContent =
    findChildByNameDirect(ifExpr, "LuauTernaryExpression_content") ?? ifExpr;
  let seenFirstCond = false;
  let elseifCondNode: SyntaxNode | null = null;
  let child = ifContent.firstChild;
  while (child) {
    if (isExplicitRuleName(child.name, "LuauTernaryExpressionCondition")) {
      if (!seenFirstCond) {
        seenFirstCond = true;
      } else if (phase === "in-elseif-cond") {
        elseifCondNode = child;
      }
    } else if (isExplicitRuleName(child.name, "LuauThenExpression")) {
      if (phase === "in-elseif-cond") {
        const cond = elseifCondNode
          ? lowerExpressionFromContainer(
              getDescendent(
                "LuauTernaryExpressionCondition_content",
                elseifCondNode,
              ) ?? elseifCondNode,
              ctx,
              null,
            )
          : lowerExpressionFromNodes(elseifCondNodes, ctx, null);
        current = { cond: cond ?? null, body: ifClauseValueNodes(child) };
        elseifCondNodes = [];
        elseifCondNode = null;
      } else {
        current.body.push(...ifClauseValueNodes(child));
      }
      phase = "wait-next";
    } else if (isExplicitRuleName(child.name, "LuauElseExpression")) {
      branches.push(current);
      current = { cond: null, body: ifClauseValueNodes(child) };
      phase = "wait-next";
    } else if (child.name === "LuauElseifKeyword") {
      branches.push(current);
      phase = "in-elseif-cond";
      elseifCondNode = null;
      elseifCondNodes = [];
    } else if (isWhitespaceNode(child.name)) {
    } else if (phase === "in-elseif-cond") {
      elseifCondNodes.push(child);
    }
    child = child.nextSibling;
  }
  branches.push(current);

  const initial = branches[0]!.cond;
  if (!initial) return null;
  const out: ConditionalSingleBranch[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    if (b.body.length === 0) continue;
    const bodyExpr = lowerExpressionFromNodes(b.body, ctx, null);
    if (!bodyExpr) continue;
    bodyExpr.outputWhenComplete = true;
    const branch = new ConditionalSingleBranch(
      wrapBranch ? wrapBranch([bodyExpr]) : [bodyExpr],
    );
    branch.isInline = true;
    if (i === 0) {
      branch.isTrueBranch = true;
    } else if (b.cond === null) {
      branch.isElse = true;
    } else {
      branch.ownExpression = b.cond;
    }
    out.push(branch);
  }
  if (out.length === 0) return null;
  return new Conditional(initial, out);
}

function findChildByNameDirect(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  let scan = parent.firstChild;
  while (scan) {
    if (isExplicitRuleName(scan.name, name)) return scan;
    scan = scan.nextSibling;
  }
  return null;
}

function findFirstDirectChild(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  const contentName = `${parent.name}_content`;
  let scan = parent.firstChild;
  while (scan) {
    if (scan.name === contentName) {
      let c = scan.firstChild;
      while (c) {
        if (isExplicitRuleName(c.name, name)) return c;
        c = c.nextSibling;
      }
      return null;
    }
    if (isExplicitRuleName(scan.name, name)) return scan;
    scan = scan.nextSibling;
  }
  return null;
}

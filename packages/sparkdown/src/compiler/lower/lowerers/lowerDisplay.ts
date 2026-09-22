import { nodeNameSet } from "../../utils/nodeNameSet";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Glue as ParsedGlue } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Glue";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { Glue as RuntimeGlue } from "../../../inkjs/engine/Glue";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import {
  FUNCTION_CALL_SHORTHAND_NODES,
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
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
  separateTags,
} from "../utils/displayCall";
import { lowerTagContent } from "../utils/lowerTagContent";
import { wrapInWeave } from "../utils/wrapInWeave";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerSparkdownSequentialAlternatorBlock";

// Each display line lowers to `display(<table>)` calls, one per beat. The table
// carries the line's routing (a `target`, and for dialogue the `character` cue)
// resolved at compile time, and its `text` as a captured string of the body's
// content (Text runs interleaved with lowered `{expr}` interpolation
// expressions). The engine's interpreter reads the tables a step collected
// (`InterpreterModule.queue`) to build that step's beat.

function buildDisplayContent(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
  lineType: string,
  identifier: string | null,
  options: { leadingGlue?: boolean } = {},
): ParsedObject[] {
  // A glued line is a continuation of the previous one. Two sources:
  //   1. This line OPENS with `..` (its own leading glue — always an
  //      `InlineAction` per the grammar). The space AFTER the `..` is the
  //      word separator, so its leading whitespace is preserved.
  //   2. The PREVIOUS line ended with a trailing `..` (`isNodePrecededBy
  //      TrailingGlue`). The separator is the previous line's space BEFORE
  //      its `..`, so this line's own leading whitespace (e.g. the space
  //      after a `CHARACTER:` / `$:` routing colon) is trimmed to avoid a
  //      doubled space.
  // Both are lowered the same way: a single leading Glue, then a call whose
  // table names no target, so the runtime joins this line's text onto the
  // previous line's beat (inheriting its display target) and the pending Glue
  // is cleanly removed.
  const ownLeadingGlue = options.leadingGlue ?? false;
  const continuationGlue =
    !ownLeadingGlue && isNodePrecededByTrailingGlue(parent, ctx);
  if (ownLeadingGlue || continuationGlue) {
    // The continuation is a `display({ text })` call carrying no routing: the
    // runtime joins it onto the step the glue keeps open, and the beat takes
    // its routing from the line it continues.
    return [
      new ParsedGlue(new RuntimeGlue()),
      ...buildDisplayCalls(parent, bodyStart, bodyEnd, ctx, mode, null, null, {
        preserveLeadingWhitespace: ownLeadingGlue,
      }),
    ];
  }
  return buildDisplayCalls(
    parent,
    bodyStart,
    bodyEnd,
    ctx,
    mode,
    lineType,
    identifier,
  );
}

// Build the `display({ target?, character?, text, pause? })` calls for a display
// statement. The table carries the routing (target + dialogue cue) resolved at
// compile time plus the body as a STRING-CAPTURE expression: the body's
// ParsedObjects wrapped in a StringExpression, so ink evaluates them
// (interpolation → live values, markup preserved) into one string at call
// time, and the interpreter parses that string.
//
// A `>` break splits the body into beats, one display() call each (see
// `splitBodyRangeAtBreaks`). Each call is its own Continue() (the engine ends
// a step at the call's closing newline), so the screenplay preview can route
// to each beat by its own checkpoint, and each call is stamped with its own
// source range. A beat a break ends carries `pause`, so it waits for a click
// even when it shows no text. Author `# tag`s ride the call's `tags`, and a
// mid-line divert follows the call. A `load` action line makes a
// `display({ load })` call instead.
//
// Glue: a `..` in the middle of a body is joined inside the captured string at
// compile time (`joinMidBodyGlue`). A TRAILING `..` is lifted out and emitted
// after the call, so it reaches the output stream and holds the step open for
// the next line's table. A `null` line type marks a glued continuation: its
// tables name no routing.
function buildDisplayCalls(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
  lineType: string | null,
  identifier: string | null,
  options: { preserveLeadingWhitespace?: boolean } = {},
): ParsedObject[] {
  // Resolve the routing at compile time: dialogue → target "dialogue" + the
  // cue; write → the layer is the target, and a write with no layer names no
  // target, so the interpreter uses its default; everything else → the line
  // type IS the target.
  let target: string | undefined;
  let character: string | undefined;
  if (lineType === null) {
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

  // A continuation's beats after a break route by the line it continues: the
  // beat the run joined it to, and failing that the line the source reads
  // before it.
  const isContinuation = lineType === null;
  const joined = isContinuation ? lexicalRouting(parent, ctx) : null;
  const ranges = splitBodyRangeAtBreaks(parent, bodyStart, bodyEnd, ctx, mode);
  const calls: ParsedObject[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    const divertTail = { objects: [] as ParsedObject[], bodyIndex: -1 };
    const walked = processDisplayBody(parent, range.from, range.to, ctx, mode, {
      ...(i === 0 ? options : {}),
      divertTail,
    });
    // Author `# tag`s are metadata, not text: they ride the call's `tags`.
    const { tags, rest: body } = separateTags(walked);
    // Text after a mid-line divert is dropped: the line's call, which the
    // divert follows, carries the text before it.
    if (divertTail.bodyIndex >= 0) {
      const before = separateTags(walked.slice(0, divertTail.bodyIndex)).rest;
      body.splice(before.length);
    }
    const trailingGlue = body.at(-1) instanceof ParsedGlue ? body.pop() : null;
    joinMidBodyGlue(body);
    const loadArgs = lineType === "action" ? stripLoadKeyword(body) : null;
    if (loadArgs) {
      calls.push(buildLoadCall(loadArgs, range, ctx, tags));
    } else {
      // An empty body still makes a call, so the line keeps its own step. A
      // statement with no body of its own is stamped from its start, since an
      // empty block body's range sits on the line after it. Every range of a
      // body a break split is stamped where it stands, even one whose visible
      // body is empty (a range holding only a divert), so it sorts among the
      // line's other beats.
      const stamped =
        body.length > 0 || range.pause || ranges.length > 1
          ? range
          : { from: parent.from, to: parent.from };
      // A glued continuation takes its routing from the beat it joins, which
      // only the run knows. Its calls name the continuation (`group`), and
      // each beat after one of its breaks asks for the routing of the beat
      // that `group` named (`inherit`), falling back to the routing its own
      // line reads.
      calls.push(
        buildDisplayCall(
          isContinuation && i > 0 ? joined?.target : target,
          isContinuation && i > 0 ? joined?.character : character,
          body,
          stamped,
          ctx,
          tags,
          {
            pause: range.pause,
            // Source offsets start again in every script, so the file the
            // continuation is written in is part of what names it.
            group: isContinuation
              ? `${ctx.filePath ?? ""}#${parent.from}`
              : undefined,
            inherit: isContinuation && i > 0,
          },
        ),
      );
    }
    if (trailingGlue) calls.push(trailingGlue);
    if (divertTail.objects.length > 0) {
      // A plain divert holds the line open with glue, so the target's first
      // line joins this one's beat. A `load` arrow's directive is its own
      // step, which the call's closing newline already starts.
      const joins = divertTail.objects.every(
        (obj) => obj instanceof Divert || obj instanceof TunnelOnwards,
      );
      if (joins) calls.push(new ParsedGlue(new RuntimeGlue()));
      calls.push(...divertTail.objects);
      // Reached only when a tunnel returns: it ends the joined line.
      calls.push(new Text("\n"));
    }
  }
  return calls;
}

// A `load <names>` action line is a world-load directive. Returns the body
// with the keyword removed, or null when the line is not one.
function stripLoadKeyword(body: ParsedObject[]): ParsedObject[] | null {
  const first = body[0];
  if (!(first instanceof Text)) return null;
  const match = /^\s*load\s/.exec(first.text);
  if (!match) return null;
  const rest = first.text.slice(match[0].length);
  return rest ? [new Text(rest), ...body.slice(1)] : body.slice(1);
}

// Resolve each mid-body `..` of a display body in place. String evaluation
// keeps newlines as literal characters, so a Glue object inside the captured
// `text` string joins nothing; the join happens here. It mirrors what the
// output stream does for flat text: the newlines before the marker and the
// whitespace through the last newline after it are removed. Only a Text
// neighbour holds whitespace; an interpolation or other neighbour is left as
// it is.
function joinMidBodyGlue(body: ParsedObject[]): void {
  for (let i = body.length - 1; i >= 0; i--) {
    if (!(body[i] instanceof ParsedGlue)) continue;
    const prev = body[i - 1];
    const next = body[i + 1];
    if (prev instanceof Text) {
      body[i - 1] = new Text(prev.text.replace(/\n[ \t\n]*$/, ""));
    }
    if (next instanceof Text) {
      body[i + 1] = new Text(next.text.replace(/^[ \t\n]*\n/, ""));
    }
    body.splice(i, 1);
  }
}

// Split a display body's source range into beat sub-ranges at its `>` breaks.
// The grammar names each break as a `Break` node (the `>` with the spaces
// around it), so we read those nodes instead of re-scanning the source
// (GRAMMAR.md §5). A split drops the break, and the newline after it when the
// break ends a block line, so the next range starts where its text does.
//
// Every break ends the range before it, which is marked `pause`, and starts
// the next. The range after the LAST break is the line's own end rather than
// a beat a break ends, so it is dropped when it holds nothing: `A >` is one
// beat, while `A > >` is that beat and the empty one the second break ends.
//
// A range with no content is a beat with no text in an inline line (`>`,
// `> Hello`, `A > > B`). In a block the line before has already ended its
// beat, or the block has just begun, so an empty range is only where the
// break split it and is dropped; a block body that is nothing but breaks
// keeps one range that shows nothing and waits for nothing.
//
// A break that ends its source line keeps the tags and comments written after
// it on that line in the range before it, so a line's tags stay with the beat
// the line shows.
function splitBodyRangeAtBreaks(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
): { from: number; to: number; pause: boolean }[] {
  const breaks = collectBreaksInRange(parent, bodyStart, bodyEnd);
  const ranges: { from: number; to: number; pause: boolean }[] = [];
  let segStart = bodyStart;
  for (const brk of breaks) {
    const newline = ctx.read(brk.to, bodyEnd).indexOf("\n");
    const lineEnd = newline < 0 ? bodyEnd : brk.to + newline;
    // A break ends its line when nothing but tags and comments follows it
    // there. Another break on the line ends a range of its own instead.
    const endsLine =
      !hasBodyContent(parent, brk.to, lineEnd, ctx) &&
      !breaks.some((other) => other.from >= brk.to && other.from < lineEnd);
    const to = endsLine
      ? ctx.read(lineEnd - 1, lineEnd) === "\r"
        ? lineEnd - 1
        : lineEnd
      : brk.from;
    ranges.push({ from: segStart, to, pause: true });
    segStart = endsLine ? Math.min(lineEnd + 1, bodyEnd) : brk.to;
  }
  ranges.push({ from: segStart, to: bodyEnd, pause: false });
  const kept = ranges.filter(
    (range, i) =>
      hasBodyContent(parent, range.from, range.to, ctx) ||
      (mode === "inline" && i < ranges.length - 1),
  );
  return kept.length > 0
    ? kept
    : [{ from: bodyStart, to: bodyEnd, pause: false }];
}

// Whether [from, to) of a display body holds anything but whitespace, author
// tags, comments and breaks.
function hasBodyContent(
  parent: SyntaxNode,
  from: number,
  to: number,
  ctx: LowerContext,
): boolean {
  let pos = from;
  for (const injection of collectTopLevelInjections(parent, from, to)) {
    if (
      injection.kind !== "tag" &&
      injection.kind !== "comment" &&
      injection.kind !== "break"
    ) {
      continue;
    }
    if (injection.from > pos && ctx.read(pos, injection.from).trim()) {
      return true;
    }
    pos = Math.max(pos, injection.to);
  }
  return pos < to && ctx.read(pos, to).trim().length > 0;
}

// Collect `Break` nodes that fall within [from, to), in source order. Skips
// any `Break` nested inside a deeper display construct whose own lowerer owns
// it — only top-of-body breaks split beats. (In practice block-display bodies
// hold their breaks directly; this guard just keeps the walk total.)
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

// ----- Body walking with interpolation splicing -----

type BodySegment =
  // `start` is the source offset the segment's raw text begins at. Block-mode
  // trimming needs it to tell a segment that begins a source line (its leading
  // whitespace is the body's indentation) from one that begins mid-line
  // because another segment preceded it (its leading whitespace is the
  // author's own spacing).
  | { kind: "text"; raw: string; start: number }
  | { kind: "expr"; node: SyntaxNode }
  | { kind: "divert"; node: SyntaxNode }
  | { kind: "inlineGluedAlt"; node: SyntaxNode }
  | { kind: "tag"; node: SyntaxNode }
  | { kind: "glue" };

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
    preserveLeadingWhitespace?: boolean;
    // Receives a mid-line divert's objects instead of the body, so the
    // caller can place them after the line's display() call. `bodyIndex` is
    // the body length when the divert was reached.
    divertTail: { objects: ParsedObject[]; bodyIndex: number };
  },
): ParsedObject[] {
  let segments = collectBodySegments(parent, bodyStart, bodyEnd, ctx);

  // Mode-specific text trimming.
  if (mode === "block") {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (seg.kind === "text") {
        // Strip each line's leading indentation (block body lines are
        // indented under their heading/cue). A segment's second and later
        // lines always begin a source line, so they are always stripped. Its
        // FIRST line begins a source line only when the segment itself starts
        // at one; when another segment precedes it on the same line — a
        // `{...}` interpolation, a `..` glue marker, a divert, a tag — the
        // leading whitespace is the author's own word separator, and stripping
        // it fuses the words (`The limit is {LIMIT} tonight.` →
        // `The limit is 5tonight.`).
        //
        // A block body range begins at a line start (`extractBlockBodyRange`
        // starts it after the cue's newline, and a range split at a break
        // that ends a line starts after the break's newline) or right after
        // a mid-line break, so the source character before a line-starting
        // segment is a newline.
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
    if (first && first.kind === "text" && !options.preserveLeadingWhitespace) {
      first.raw = first.raw.replace(/^\s+/, "");
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === "text") {
      last.raw = last.raw.replace(/\s+$/, "");
    }
  }

  segments = segments.filter((s) => !(s.kind === "text" && s.raw.length === 0));

  const out: ParsedObject[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "text") {
      const text = applyDisplayEscapes(seg.raw);
      if (text.length > 0) out.push(new Text(text));
    } else if (seg.kind === "glue") {
      // A `..` glue marker sitting WITHIN display content (most commonly a
      // TRAILING `text ..` at end of line, but also a mid-body `..`). The
      // grammar already produces a `Glue` node (it's even syntax-
      // highlighted); without this branch `collectBodySegments` would read
      // its raw `..` characters as literal text and the lines would never
      // join. Leading `..` is handled separately by the `leadingGlue` path
      // (the glue is excluded from the body range there), so this only fires
      // for non-leading glue. Emits the same runtime marker as `lowerGlue`.
      out.push(new ParsedGlue(new RuntimeGlue()));
    } else if (seg.kind === "inlineGluedAlt") {
      // `Here is text .. queue|A|B|C .. and more` — inline-glued
      // alternator embedded in display content. The grammar matches
      // a dedicated `LuauSparkdownInlineGlued{Sequential,Conditional}
      // AlternatorBlock` rule whose `_begin`/`_content`/`_end` shape is
      // structurally identical to the block-form and inline-`{}` forms.
      // The same lowerer family handles all three via dynamic prefix
      // derivation, so we just need to route this node through it.
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
      if (lowered.content) {
        for (const obj of lowered.content) out.push(obj);
      }
    } else if (seg.kind === "tag") {
      // `text # tag` / `text # tag # more` — trailing tag annotation
      // on a display line. The `Tags` grammar wrapper contains one or
      // more `Tag` children; each Tag emits a `BeginTag` + content +
      // `EndTag` triplet so the runtime collects the tag string into
      // `currentTags`. `appendDisplayTagContent` handles `{var}`
      // interpolations inside the tag body (single-identifier refs
      // only — same constraint as the choice-tag interpolation path).
      appendDisplayTags(seg.node, ctx, out);
    } else if (seg.kind === "expr") {
      // `{if cond then a else b}` — sparkdown's inline-conditional
      // equivalent of ink's `{cond:a|b}`. Detect this shape inside
      // an interpolation and lower as a `Conditional` ParsedObject
      // (emits the chosen branch's value into the output stream)
      // rather than as a plain Expression.
      const inlineCond = tryLowerInlineConditional(seg.node, ctx);
      if (inlineCond) {
        out.push(inlineCond);
      } else {
        // `{queue|A|B|C end}` / `{plural(n)|one="…"|other="…" end}` —
        // inline alternator blocks. Route through the existing
        // alternator lowerers (which produce a Sequence / Conditional
        // wrapped in a Weave) and splice the result into the display
        // content stream.
        const inlineAlt = tryLowerInlineAlternator(seg.node, ctx);
        if (inlineAlt) {
          for (const obj of inlineAlt) out.push(obj);
        } else {
          const expr = lowerExpressionFromContainer(seg.node, ctx);
          if (expr) {
            expr.outputWhenComplete = true;
            out.push(expr);
          }
        }
      }
    } else {
      // Inline mid-line divert (`text -> target`). Its objects go to
      // `divertTail`, which the caller places after the line's call.
      const divertObjects = buildDivert(seg.node, ctx);
      // A mid-line `load` arrow follows the standalone shape rules; the
      // diagnostic rides the context buffer because this block's own
      // diagnostics are not surfaced from this depth.
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

// Walk [bodyStart, bodyEnd) and produce a linear list of raw text segments
// interleaved with top-level `LuauInterpolatedStringExpression` and `Divert`
// nodes. Nested interpolations (e.g. inside a backtick string in the body)
// are intentionally not promoted — they belong to the backtick string's own
// interpolation.
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
      // A break left in a range (a trailing one, or one on a line the split
      // passed over) contributes no text.
      idx++;
      i = next.to;
      continue;
    }
    if (next && next.from === i) {
      flush();
      if (next.kind === "expr") {
        out.push({ kind: "expr", node: next.node });
      } else if (next.kind === "divert") {
        out.push({ kind: "divert", node: next.node });
      } else if (next.kind === "tag") {
        out.push({ kind: "tag", node: next.node });
      } else if (next.kind === "glue") {
        out.push({ kind: "glue" });
      } else if (next.kind === "comment") {
        // Emit nothing — the comment is removed. Swallow the trailing
        // newline ONLY for a whole-line comment (nothing but indent before
        // the `//`), so the line vanishes cleanly. For a hypothetical
        // end-of-line comment with text before it (`say hi // note`), keep
        // the newline — otherwise the next line would merge onto this one.
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
      // Defensive: skip past any injection we've already passed.
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
    | "expr"
    | "divert"
    | "inlineGluedAlt"
    | "tag"
    | "comment"
    | "glue"
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
      // Don't descend into a backtick string — its inner `{...}` belongs to
      // the string itself, not the surrounding display body.
      if (node.name === "LuauInterpolatedString") return;
      if (
        node.name === "LuauInterpolatedStringExpression" ||
        node.name === "LuauFunctionCallShorthand"
      ) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "expr", node, from: node.from, to: node.to });
        }
        return;
      }
      if (node.name === "Divert") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          // The grammar captures the whitespace before `->` inside the
          // Divert node (as `Indent` / `OptionalSeparator`). Anchor the
          // injection on the `DivertMark` so any leading whitespace remains
          // as part of the preceding text segment — that space is what
          // separates the text from the diverted-to content visually.
          const mark = getDescendent("DivertMark", node);
          const from = mark ? mark.from : node.from;
          out.push({ kind: "divert", node, from, to: node.to });
        }
        return;
      }
      if (INLINE_GLUED_ALTERNATOR_NAMES.has(node.name)) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          // The alternator's `_begin` captures the leading whitespace,
          // the opening `..`, the keyword, and the optional modifier.
          // To preserve the visible space before the alternator opens
          // (`Before .. queue|A|B|C ..` → `Before A`), anchor the
          // injection's `from` on the opening `..` (Glue inside
          // `_begin`) rather than on the alternator node's leading edge.
          const beginNode = findChildByNameDirect(node, `${node.name}_begin`);
          const openingGlue = beginNode
            ? getDescendent("Glue", beginNode)
            : null;
          const from = openingGlue ? openingGlue.from : node.from;

          // The closing `..` is a sibling of the alternator's *enclosing*
          // text-chunk container, not of the alternator itself. Walk up
          // to the wrapping container (TextChunk_content, TextChunk, or
          // similar) and look for the next-sibling `Glue` that sits
          // immediately after — that's the matching closing marker.
          let to = node.to;
          const closingGlue = findClosingGlueForAlternator(node);
          if (closingGlue && closingGlue.to <= bodyEnd) {
            to = closingGlue.to;
          }
          out.push({ kind: "inlineGluedAlt", node, from, to });
        }
        return;
      }
      // `Tags` wraps one or more trailing `# tag` annotations after
      // display text on the same line. The grammar already parses these
      // correctly (see grammar/flow/dynamic-tag-on-display-line.snap);
      // we just need to splice them as a separate "tag" segment so the
      // surrounding text doesn't absorb the `#` and so `appendDisplayTags`
      // can emit a `BeginTag` / content / `EndTag` triplet per Tag child.
      if (node.name === "Tags") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "tag", node, from: node.from, to: node.to });
        }
        return;
      }
      // A `//` display comment inside a display body (e.g. a `// note`
      // line under a dialogue cue). Splice it out entirely — it contributes
      // no text. The trailing newline is consumed in collectBodySegments so
      // the line vanishes rather than leaving a blank.
      if (
        node.name === "SparkdownLineComment" ||
        node.name === "SparkdownInlineComment"
      ) {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "comment", node, from: node.from, to: node.to });
        }
        return;
      }
      // A `..` glue marker embedded in display content — a TRAILING
      // `text ..` (or a mid-body `..`). The `Glue` grammar node spans its
      // leading whitespace plus the `..` (`(?:ws)*(?:[.][.])`); the `..` is
      // always the final two characters. Anchor the injection on the `..`
      // itself (`node.to - 2`) rather than `node.from` so the whitespace
      // before it stays in the preceding text segment — that single space
      // is what separates the joined words (`shadows ..` + `and` →
      // `shadows and`, mirroring the leading-glue form `shadows` + `.. and`).
      // The opening/closing `..` of an inline-glued alternator are NOT
      // reached here: the alternator branch above returns before descending,
      // and its closing `Glue` (consumed into the alternator's range) is
      // defensively skipped in `collectBodySegments`.
      if (node.name === "Glue") {
        if (node.from >= bodyStart && node.to <= bodyEnd) {
          out.push({ kind: "glue", node, from: node.to - 2, to: node.to });
        }
        return;
      }
      // A `>` break with the spaces around it. `splitBodyRangeAtBreaks`
      // decides where beats split; within a range a break is no text.
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

// ----- Escape / newline handling for display text -----

// Resolves escapes in one raw text segment of a display body:
//   - `\<space|tab|newline>` → a line break, plus the run of spaces/tabs
//     immediately after it (the author's line-continuation indent) is dropped
//   - `\<other>`             → kept as literal `\<char>` (so `\*` stays `\*`)
//   - plain `\n` mid-content → a line break
//
// A line break carries no whitespace of its own, whichever of the two forms
// the author used to write it. The block-body caller has already stripped the
// indentation that puts continuation lines under their cue, so adding a space
// back here would put a space in the story text that the author never wrote —
// and, next to a `..` glue marker whose own separating space is already in the
// preceding segment, would make the join two spaces wide and audibly lengthen
// the pause the letter-by-letter typing puts between the joined words.
//
// The result goes straight into a `Text` object and is never re-scanned, so
// nothing downstream can mistake a `{` after a break for an escaped one:
// `collectBodySegments` lifts every interpolation out into its own segment
// before this function sees the text.
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

// ----- Tag annotations on display lines -----

// Lowers a `Tags` node (one or more `Tag` annotations after a display
// line's text content) into `BeginTag` / content / `EndTag` triplets,
// pushing them into `out`. Each `Tag` child becomes one triplet.
// Tag bodies support `{var}` interpolations — single-identifier
// references emit a `VariableReference` with `outputWhenComplete=true`;
// non-identifier expressions and bare text emit as literal text. The
// runtime walks the resulting BeginTag/StringValue/VariableReference
// /EndTag sequence and accumulates the substituted strings into
// `currentTags`. (Same machinery as the choice-tag interpolation path
// in `lowerChoice.ts > appendTagContent` — keeping the two impls
// parallel; an expression-lowerer rewrite would unify them.)
function appendDisplayTags(
  tagsNode: SyntaxNode,
  ctx: LowerContext,
  out: ParsedObject[],
): void {
  // Tags grammar wraps its content in a `Tags_content` child (begin/
  // content/end shape). Look at the named `Tags_content` first; fall
  // back to direct iteration for safety.
  const contentNode =
    findChildByNameDirect(tagsNode, "Tags_content") ?? tagsNode;
  let child = contentNode.firstChild;
  while (child) {
    if (child.name === "Tag") {
      out.push(new Tag(true));
      // `Tag`'s capture 3 wraps with the `TagContent` named rule
      // (§6.4: address by name, not by `_cN` index). `TagContent`
      // lives one level inside the auto-generated `_c3` capture
      // wrapper, so `getDescendent` is required to reach it.
      const tagContent = getDescendent("TagContent", child);
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

// ----- Body region extraction -----

function extractInlineBodyRange(nodeRef: SparkdownSyntaxNodeRef): {
  from: number;
  to: number;
} {
  const colon = getDescendent(
    ["ColonSeparator", "ColonOperator"],
    nodeRef.node,
  );
  if (colon) return { from: colon.to, to: nodeRef.to };
  // When the inline action is introduced by a `..` glue marker (no colon),
  // skip past it so the literal `..` doesn't bleed into the body text.
  const glue = getDescendent("Glue", nodeRef.node);
  if (glue) return { from: glue.to, to: nodeRef.to };
  return { from: nodeRef.from, to: nodeRef.to };
}

function hasLeadingGlue(nodeRef: SparkdownSyntaxNodeRef): boolean {
  return getDescendent("Glue", nodeRef.node) != null;
}

// The display line each statement kind routes by.
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

// The routing of the line a glued continuation continues, as the SOURCE reads
// it: the display line before it, or the line that one continues in turn. The
// run may join the continuation to another line instead (one a divert brought
// here), which is what `inherit` asks for; this is the answer when no such
// beat ran, as after a jump straight to the continuation's own beat.
function lexicalRouting(
  node: SyntaxNode,
  ctx: LowerContext,
): { target?: string; character?: string } | null {
  let sib: SyntaxNode | null = node.prevSibling;
  while (sib) {
    if (GLUE_SKIP_SIBLINGS.has(sib.name)) {
      sib = sib.prevSibling;
      continue;
    }
    const lineType = DISPLAY_LINE_TYPES[sib.name];
    if (!lineType) return null;
    // A continuation routes by what the line IT continues routes by, in both
    // spellings: a line that opens with `..`, and a line the line before it
    // held open with a trailing `..`.
    const glue = getDescendent("Glue", sib);
    const opensWithGlue = glue != null && !ctx.read(sib.from, glue.from).trim();
    if (opensWithGlue || isNodePrecededByTrailingGlue(sib, ctx)) {
      sib = sib.prevSibling;
      continue;
    }
    const read = (name: SparkdownNodeName) => {
      const found = getDescendent(name, sib!);
      return found ? ctx.read(found.from, found.to).trim() : undefined;
    };
    if (lineType === "dialogue") {
      return {
        target: "dialogue",
        character: read("DialogueCharacterName") || undefined,
      };
    }
    if (lineType === "write") {
      return { target: read("WriteTarget") || undefined };
    }
    return { target: lineType };
  }
  return null;
}

// Sibling node names that sit between two display constructs without being
// content themselves — skipped when looking back for the preceding construct.
// A `//` comment line is among them: it shows nothing, so a `..` reaches
// across it at run time, and the line after it is the continuation of the
// line before it.
const GLUE_SKIP_SIBLINGS: ReadonlySet<string> = nodeNameSet([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "SparkdownLineComment",
]);

// True when the immediately-preceding top-level sibling construct ends with a
// TRAILING `..` glue marker (`text ..<eol>`). A trailing `..` means "join the
// next line onto this one", so the FOLLOWING display construct (of ANY type —
// action, dialogue, heading, title, transitional, write) must be lowered as a
// leading-glue continuation (a table naming no target) — the symmetric twin of
// the leading-`..` form. A table naming its own target would route the joined
// beat by this line when it is the first to name one, re-cueing a fresh beat
// instead of continuing the previous one. Mirroring the leading form keeps the
// continuation routed to the previous line's target.
function isNodePrecededByTrailingGlue(
  node: SyntaxNode,
  ctx: LowerContext,
): boolean {
  let sib: SyntaxNode | null = node.prevSibling;
  while (sib && GLUE_SKIP_SIBLINGS.has(sib.name)) sib = sib.prevSibling;
  if (!sib) return false;
  return endsWithTrailingGlue(sib, ctx);
}

// True when `node`'s last visible content is a `..` glue marker — i.e. the
// right-most `Glue` descendant ends exactly at the node's trailing-whitespace-
// trimmed end. Mid-construct glues (followed by more text) don't count.
function endsWithTrailingGlue(node: SyntaxNode, ctx: LowerContext): boolean {
  const text = ctx.read(node.from, node.to);
  const trimmed = text.replace(/\s+$/, "");
  // Fast reject before the subtree walk: a trailing glue's last visible
  // characters are always `..`. Most display lines don't end that way, so this
  // skips the walk for them. (`...` ellipsis also passes this cheap check but
  // is rejected below — it isn't a `Glue` node, so no descendant ends at
  // `trimmedEnd`.)
  if (!trimmed.endsWith("..")) return false;
  const trimmedEnd = node.from + trimmed.length;
  let lastGlueEnd = -1;
  const visit = (n: SyntaxNode): void => {
    if (n.name === "Glue" && n.to > lastGlueEnd) lastGlueEnd = n.to;
    let c = n.firstChild;
    while (c) {
      visit(c);
      c = c.nextSibling;
    }
  };
  visit(node);
  return lastGlueEnd === trimmedEnd;
}

// For block forms, the body spans every line after the first newline. The
// per-line indentation is stripped later by `processDisplayBody` in `block`
// mode.
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

// ----- Inline display forms -----

export function lowerInlineDialogue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const character = readIdentifier(nodeRef, ctx, "DialogueCharacterName");
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayContent(
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
  // Trailing-glue continuation (this line glued onto by the previous line's
  // `..`) is detected centrally in `buildDisplayContent`.
  return wrapInWeave(
    buildDisplayContent(
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

// Top-level `{ ... }` interpolation. Sparkdown's grammar matches
// `LuauInterpolatedStringExpression` BEFORE SparkdownStatement at top
// level (grammar.yaml line 186), so a bare `{ expr }` line never gets
// wrapped in `ImplicitAction` / `TextChunk` the way a line with
// surrounding text does. Without a dedicated lowerer here, the
// CompilationAnnotator's `lower()` returns `undefined` for these
// nodes and they'd be dropped (there is no parser fallback — the
// grammar+lowerers are the only path — and nothing else knows Luau
// operators `^`, `//`, `..`). This handler lowers the inner expression
// directly, marked `outputWhenComplete` so its value is captured, into a
// `display({ text })` call on the default target.
//
// Interpolations on one source line (`{x}{y}`, or `{x} {y}`) form one
// display line, as ink's `{x}{y}` does: the first of the chain lowers the
// whole chain to one call, and the rest contribute nothing of their own.
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
    const expr = lowerExpressionFromContainer(node, ctx);
    if (expr) {
      expr.outputWhenComplete = true;
      body.push(expr);
    }
  }
  if (body.length === 0) return {};
  return wrapInWeave([
    buildDisplayCall(
      undefined,
      undefined,
      body,
      { from: nodeRef.node.from, to: last.to },
      ctx,
    ),
  ]);
}

// The interpolation sibling on the same source line next to `node` in the
// given direction, skipping whitespace (`{x} {y}` is one line as `{x}{y}`
// is), or null.
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
      cursor.name === "LuauInterpolatedStringExpression" ||
      cursor.name === "LuauFunctionCallShorthand"
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
  const { from, to } = extractInlineBodyRange(nodeRef);
  // This line's OWN leading `..`. A trailing-glue continuation (previous line
  // ended with `..`) is detected centrally in `buildDisplayContent`.
  const leadingGlue = hasLeadingGlue(nodeRef);
  return wrapInWeave(
    buildDisplayContent(nodeRef.node, from, to, ctx, "inline", "action", null, {
      leadingGlue,
    }),
  );
}

export function lowerInlineHeading(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayContent(nodeRef.node, from, to, ctx, "inline", "heading", null),
  );
}

export function lowerInlineTitle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayContent(nodeRef.node, from, to, ctx, "inline", "title", null),
  );
}

export function lowerInlineTransitional(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
  return wrapInWeave(
    buildDisplayContent(
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
    buildDisplayContent(nodeRef.node, from, to, ctx, "inline", "write", target),
  );
}

// ----- Block (multi-line) display forms -----

export function lowerBlockDialogue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const character = readIdentifier(nodeRef, ctx, "DialogueCharacterName");
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayContent(
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
    buildDisplayContent(nodeRef.node, from, to, ctx, "block", "action", null),
  );
}

export function lowerBlockHeading(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayContent(nodeRef.node, from, to, ctx, "block", "heading", null),
  );
}

export function lowerBlockTitle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayContent(nodeRef.node, from, to, ctx, "block", "title", null),
  );
}

export function lowerBlockTransitional(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractBlockBodyRange(nodeRef, ctx);
  return wrapInWeave(
    buildDisplayContent(
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
    buildDisplayContent(nodeRef.node, from, to, ctx, "block", "write", target),
  );
}

// Detects the `{if cond then a else b}` pattern inside an interpolation
// node and lowers it as an inkjs `Conditional` ParsedObject. The
// grammar parses the if-expression as a string of sibling nodes inside
// the interpolation: `LuauTernaryExpression` (carrying the condition),
// `LuauThenKeyword`, then-value sibling(s), optional `LuauElseKeyword`
// + else-value sibling(s). We rebuild that into a Conditional with
// `ConditionalSingleBranch` branches whose `_innerWeave` contains the
// per-branch value as an Expression with `outputWhenComplete = true`,
// so the chosen branch evaluates and emits its value into the output
// stream — same end-effect as ink's `{cond:a|b}`.
// Sparkdown alternator blocks (`queue|chain|cycle|shuffle…|…end` and
// `plural(x)|one="…"|other="…" end`) are normally top-level constructs
// dispatched by `lower()` to their dedicated lowerers. When they appear
// *inline* — inside a `LuauInterpolatedStringExpression`, e.g.
// `{queue|A|B|C end}` — the inline interpolation path would otherwise
// drop them on the floor (expression-token collection doesn't know how
// to handle alternator nodes).
//
// This helper detects the case where an interpolation's content is an
// alternator block and routes the lowering through the existing
// top-level lowerers, returning the resulting `ParsedObject[]` so the
// caller can splice them into the surrounding display content. The
// runtime then runs the Sequence / Conditional in place, emitting the
// chosen arm's content into the output stream — same semantics as the
// block form, but spelled inline.
function tryLowerInlineAlternator(
  interpNode: SyntaxNode,
  ctx: LowerContext,
): ParsedObject[] | null {
  // The grammar uses two different rule names depending on whether the
  // alternator is top-level (`LuauSparkdown*AlternatorBlock`, has a
  // statement-ending terminator) or inline-inside-`{...}` (plain
  // `Luau*AlternatorBlock`, has a `]/)/}/end`-terminator). The lowerers
  // handle both via dynamic prefix derivation from `nodeRef.node.name`,
  // so we just need to find either variant here. Look for the
  // interpolation-content child first (a `_content` wrapper), then any
  // direct child below.
  // `{{...}}` is call-only: never reinterpret its body as an alternator —
  // fall through to `lowerExpressionFromContainer`, which enforces the
  // shorthand semantics (`{{queue|A|B end}}` is an error, not an alternator).
  if (FUNCTION_CALL_SHORTHAND_NODES.has(interpNode.name)) return null;
  const content = findFirstDirectChild(
    interpNode,
    "LuauInterpolatedStringExpression_content",
  );
  const host = content ?? interpNode;
  const seq =
    findFirstDirectChild(host, "LuauSequentialAlternatorBlock") ??
    findFirstDirectChild(host, "LuauSparkdownSequentialAlternatorBlock");
  if (seq) {
    const lowered = lowerSparkdownSequentialAlternatorBlock(
      makeAltNodeRef(seq),
      ctx,
    );
    return lowered.content ?? null;
  }
  const cond =
    findFirstDirectChild(host, "LuauConditionalAlternatorBlock") ??
    findFirstDirectChild(host, "LuauSparkdownConditionalAlternatorBlock");
  if (cond) {
    const lowered = lowerSparkdownConditionalAlternatorBlock(
      makeAltNodeRef(cond),
      ctx,
    );
    return lowered.content ?? null;
  }
  return null;
}

// Construct a synthetic `SparkdownSyntaxNodeRef` from a bare `SyntaxNode`.
// The alternator lowerers only consult `nodeRef.node` for tree-walking;
// they don't use the other `SyntaxNodeRef` fields. The cast is safe
// because both paths agree on the structural minimum.
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
): Conditional | null {
  // Call-only shorthand: `{{if … then … else …}}` must NOT become a
  // Conditional — see the matching guard in `tryLowerInlineAlternator`.
  if (FUNCTION_CALL_SHORTHAND_NODES.has(interpNode.name)) return null;
  const ifExpr = findFirstDirectChild(interpNode, "LuauTernaryExpression");
  if (!ifExpr) return null;
  const firstCondContent = getDescendent(
    "LuauTernaryExpressionCondition_content",
    ifExpr,
  );
  if (!firstCondContent) return null;

  // Walk the children of `LuauTernaryExpression`. Since the rule no
  // longer ends at `(?=then)`, the `then`/`else` clauses parse as
  // nested `LuauThenExpression`/`LuauElseExpression` children, with
  // `elseif` appearing as a free-standing `LuauElseifKeyword` (caught
  // by `LuauTernaryKeyword`) between branches:
  //   LuauTernaryExpression
  //     ├ LuauTernaryExpressionCondition  (first if-cond)
  //     ├ LuauThenExpression              (`then <body1>`)
  //     ├ LuauElseifKeyword (×N)          → start elseif-cond phase
  //     ├ <cond-N expression nodes>
  //     ├ LuauThenExpression              (`then <bodyN>`)
  //     └ LuauElseExpression?             (`else <body>`)
  type Branch = { cond: Expression | null; body: SyntaxNode[] };
  const branches: Branch[] = [];
  const firstCond = lowerExpressionFromContainer(firstCondContent, ctx);
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

  // Collect the expression nodes inside a `LuauThenExpression` /
  // `LuauElseExpression` wrapper. The wrapper's `_content` child holds
  // the operator (`LuauThenOperator`/`LuauElseOperator`) plus the
  // branch body. Skip the operator and any whitespace-only nodes.
  const collectClauseBody = (clause: SyntaxNode): SyntaxNode[] => {
    const body: SyntaxNode[] = [];
    const content =
      findChildByNameDirect(clause, `${clause.name}_content`) ?? clause;
    let bodyChild = content.firstChild;
    while (bodyChild) {
      if (
        bodyChild.name !== "LuauThenOperator" &&
        bodyChild.name !== "LuauElseOperator" &&
        !isWhitespaceNode(bodyChild.name)
      ) {
        body.push(bodyChild);
      }
      bodyChild = bodyChild.nextSibling;
    }
    return body;
  };

  // The actual child clauses live inside the `_content` wrapper that
  // begin/end rules emit, not as direct children of the rule node.
  const ifContent =
    findChildByNameDirect(ifExpr, "LuauTernaryExpression_content") ?? ifExpr;
  // The first `LuauTernaryExpressionCondition` was already lowered as
  // `firstCond` above. Subsequent `LuauTernaryExpressionCondition`
  // children belong to `elseif` clauses — they appear because the
  // condition rule's `(?<=if\b{{WS}}*)` lookbehind also fires after
  // `elseif`'s trailing `if\b`. Track whether we've consumed the first.
  let seenFirstCond = false;
  let elseifCondNode: SyntaxNode | null = null;
  let child = ifContent.firstChild;
  while (child) {
    if (child.name === "LuauTernaryExpressionCondition") {
      if (!seenFirstCond) {
        seenFirstCond = true;
      } else if (phase === "in-elseif-cond") {
        elseifCondNode = child;
      }
    } else if (child.name === "LuauThenExpression") {
      if (phase === "in-elseif-cond") {
        const cond = elseifCondNode
          ? lowerExpressionFromContainer(
              getDescendent(
                "LuauTernaryExpressionCondition_content",
                elseifCondNode,
              ) ?? elseifCondNode,
              ctx,
            )
          : lowerExpressionFromNodes(elseifCondNodes, ctx);
        current = { cond: cond ?? null, body: collectClauseBody(child) };
        elseifCondNodes = [];
        elseifCondNode = null;
      } else {
        current.body.push(...collectClauseBody(child));
      }
      phase = "wait-next";
    } else if (child.name === "LuauElseExpression") {
      branches.push(current);
      current = { cond: null, body: collectClauseBody(child) };
      phase = "wait-next";
    } else if (child.name === "LuauElseifKeyword") {
      branches.push(current);
      phase = "in-elseif-cond";
      elseifCondNode = null;
      elseifCondNodes = [];
    } else if (isWhitespaceNode(child.name)) {
      // Structural whitespace between siblings.
    } else if (phase === "in-elseif-cond") {
      elseifCondNodes.push(child);
    }
    child = child.nextSibling;
  }
  branches.push(current);

  // Build the inkjs `Conditional` + `ConditionalSingleBranch` list.
  // First branch is the if-branch (uses the initialCondition); each
  // elseif becomes its own boolean-test branch; the trailing else is
  // marked `isElse=true`.
  const initial = branches[0]!.cond;
  if (!initial) return null;
  const out: ConditionalSingleBranch[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    if (b.body.length === 0) continue;
    const bodyExpr = lowerExpressionFromNodes(b.body, ctx);
    if (!bodyExpr) continue;
    bodyExpr.outputWhenComplete = true;
    const branch = new ConditionalSingleBranch([bodyExpr]);
    branch.isInline = true;
    if (i === 0) {
      branch.isTrueBranch = true;
    } else if (b.cond === null) {
      branch.isElse = true;
    } else {
      // elseif: own condition, no equality match (`matchingEquality=false`)
      branch.ownExpression = b.cond;
    }
    out.push(branch);
  }
  if (out.length === 0) return null;
  return new Conditional(initial, out);
}

// Direct child lookup that does NOT descend into a `_content` wrapper.
// Used to find an alternator's `_begin` / `_content` / `_end` rule children.
function findChildByNameDirect(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  let scan = parent.firstChild;
  while (scan) {
    if (scan.name === name) return scan;
    scan = scan.nextSibling;
  }
  return null;
}

// Find the closing `..` `Glue` node that pairs with an inline-glued
// alternator. The alternator sits inside an enclosing text-chunk
// container (e.g. `TextChunk_content`); the closing `..` is captured as
// a separate `Glue` rule whose tree position is a sibling of the
// alternator's enclosing `TextChunk`, not of the alternator itself.
// Walk up the parent chain, scanning forward through siblings at each
// level (skipping structural `_begin`/`_content`/`_end` wrappers), and
// return the first `Glue` whose left edge is immediately adjacent.
function findClosingGlueForAlternator(altNode: SyntaxNode): SyntaxNode | null {
  let cursor: SyntaxNode | null = altNode;
  while (cursor) {
    let sib: SyntaxNode | null = cursor.nextSibling;
    while (sib) {
      if (sib.name === "Glue") return sib;
      // Skip past wrapper siblings (TextChunk_end, etc.) and look further.
      if (
        sib.name.endsWith("_begin") ||
        sib.name.endsWith("_end") ||
        sib.name.endsWith("_content")
      ) {
        sib = sib.nextSibling;
        continue;
      }
      // A real (non-wrapper) sibling that isn't `Glue` — no closing
      // marker at this nesting level.
      return null;
    }
    cursor = cursor.parent;
  }
  return null;
}

function findFirstDirectChild(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  // Look inside the parent's `_content` wrapper if present (begin/end rules).
  const contentName = `${parent.name}_content`;
  let scan = parent.firstChild;
  while (scan) {
    if (scan.name === contentName) {
      let c = scan.firstChild;
      while (c) {
        if (c.name === name) return c;
        c = c.nextSibling;
      }
      return null;
    }
    if (scan.name === name) return scan;
    scan = scan.nextSibling;
  }
  return null;
}

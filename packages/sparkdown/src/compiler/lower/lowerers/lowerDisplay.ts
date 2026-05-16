import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Glue as RuntimeGlue } from "../../../inkjs/engine/Glue";
import { Glue as ParsedGlue } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Glue";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { buildDivert } from "../utils/buildDivert";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerSparkdownSequentialAlternatorBlock";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerSparkdownConditionalAlternatorBlock";
import { wrapInWeave } from "../utils/wrapInWeave";

// Slice 4: each display line emits a Tag pair carrying the line type (and
// optional identifier such as a character name or write target), then the
// body's content nodes (Text runs interleaved with lowered `{expr}`
// interpolation expressions), followed by a trailing newline Text.

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
  const content: ParsedObject[] = [];
  if (options.leadingGlue) {
    // `..` glue marker — emitted first so the runtime's output-stream trim
    // walks past the previous line's trailing newline. For glued lines we
    // skip the line-type metadata tag pair: the tag's inner text ("action",
    // etc.) is non-whitespace and would prevent the runtime from cleanly
    // removing the existing Glue once real body text arrives, leaving the
    // Glue in the stream and causing subsequent newlines to be dropped. The
    // glued content conceptually inherits the previous line's type anyway.
    content.push(new ParsedGlue(new RuntimeGlue()));
  } else {
    content.push(new Tag(true));
    content.push(new Text(identifier ? `${lineType}:${identifier}` : lineType));
    content.push(new Tag(false));
  }
  content.push(
    ...processDisplayBody(parent, bodyStart, bodyEnd, ctx, mode, {
      preserveLeadingWhitespace: options.leadingGlue,
    }),
  );
  content.push(new Text("\n"));
  return content;
}

// ----- Body walking with interpolation splicing -----

type BodySegment =
  | { kind: "text"; raw: string }
  | { kind: "expr"; node: SyntaxNode }
  | { kind: "divert"; node: SyntaxNode }
  | { kind: "inlineGluedAlt"; node: SyntaxNode }
  | { kind: "tag"; node: SyntaxNode };

const INLINE_GLUED_ALTERNATOR_NAMES = new Set([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

function processDisplayBody(
  parent: SyntaxNode,
  bodyStart: number,
  bodyEnd: number,
  ctx: LowerContext,
  mode: "inline" | "block",
  options: { preserveLeadingWhitespace?: boolean } = {},
): ParsedObject[] {
  let segments = collectBodySegments(parent, bodyStart, bodyEnd, ctx);

  // Mode-specific text trimming.
  if (mode === "block") {
    for (const seg of segments) {
      if (seg.kind === "text") {
        seg.raw = seg.raw
          .split(/\r?\n/)
          .map((line) => line.replace(/^[ \t]+/, ""))
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

  segments = segments.filter(
    (s) => !(s.kind === "text" && s.raw.length === 0),
  );

  const out: ParsedObject[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "text") {
      const isLast = i === segments.length - 1;
      const text = applyDisplayEscapes(seg.raw);
      if (isLast) {
        const { body, trailingBreak } = detectTrailingBreak(text);
        if (body.length > 0) out.push(new Text(body));
        if (trailingBreak) out.push(new Text("\n"));
      } else {
        if (text.length > 0) out.push(new Text(text));
      }
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
      // Inline mid-line divert (`text -> target`). Emit the Divert directly
      // into the display weave — flow transfers to the target scene after
      // the preceding text has been output. The caller (buildDisplayContent)
      // still appends a trailing Text("\n"), but the runtime suppresses it
      // because the Divert has already moved execution elsewhere; if the
      // diverted-to scene wants to start its content on the same line, it
      // can continue without a leading newline.
      const divertObjects = buildDivert(seg.node, ctx);
      for (const obj of divertObjects) out.push(obj);
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
  let i = bodyStart;
  let idx = 0;

  const flush = () => {
    if (textBuf.length > 0) {
      out.push({ kind: "text", raw: textBuf });
      textBuf = "";
    }
  };

  while (i < bodyEnd) {
    const next = injections[idx];
    if (next && next.from === i) {
      flush();
      if (next.kind === "expr") {
        out.push({ kind: "expr", node: next.node });
      } else if (next.kind === "divert") {
        out.push({ kind: "divert", node: next.node });
      } else if (next.kind === "tag") {
        out.push({ kind: "tag", node: next.node });
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
    textBuf += ctx.read(i, i + 1);
    i++;
  }
  flush();
  return out;
}

interface BodyInjection {
  kind: "expr" | "divert" | "inlineGluedAlt" | "tag";
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
      if (node.name === "LuauInterpolatedStringExpression") {
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
          const beginNode = findChildByNameDirect(
            node,
            `${node.name}_begin`,
          );
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

// ----- Escape / break / newline parity with `ContentTextAllowingEscapeChar` -----

// Mirrors `InkParser.ContentTextAllowingEscapeChar`:
//   - `\<space|tab|newline>` → paragraph break, inserts `\n ` (trailing space
//     prevents the next chunk's `{...}` logic from being read as escaped)
//   - `\<other>`             → kept as literal `\<char>` (so `\*` stays `\*`)
//   - plain `\n` mid-content → also `\n ` (same trailing-space rule)
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
        out += "\n ";
        i += 2;
        while (i < input.length && (input[i] === " " || input[i] === "\t")) {
          i++;
        }
      } else {
        out += "\\" + next;
        i += 2;
      }
    } else if (c === "\n") {
      out += "\n ";
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function detectTrailingBreak(text: string): {
  body: string;
  trailingBreak: boolean;
} {
  const trimmed = text.replace(/[\s]+$/, "");
  if (/ >$/.test(trimmed)) {
    return { body: trimmed.slice(0, -1), trailingBreak: true };
  }
  return { body: text, trailingBreak: false };
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
      const c3 = findChildByNameDirect(child, "Tag_c3");
      if (c3) {
        appendInterpolatedTagText(ctx.read(c3.from, c3.to), out);
      }
      out.push(new Tag(false));
    }
    child = child.nextSibling;
  }
}

// Splits a raw tag-body string on `{...}` interpolations. Single-
// identifier references (`{name}`) emit a `VariableReference`;
// complex expressions emit as literal text so the author sees an
// un-resolved form rather than silent failure. Plain text spans
// between brace pairs emit as `Text` nodes.
function appendInterpolatedTagText(raw: string, out: ParsedObject[]): void {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;
  let i = 0;
  while (i < trimmed.length) {
    const open = trimmed.indexOf("{", i);
    if (open === -1) {
      out.push(new Text(trimmed.slice(i)));
      break;
    }
    if (open > i) {
      out.push(new Text(trimmed.slice(i, open)));
    }
    const close = trimmed.indexOf("}", open);
    if (close === -1) {
      out.push(new Text(trimmed.slice(open)));
      break;
    }
    const exprText = trimmed.slice(open + 1, close).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(exprText)) {
      const ref = new VariableReference([new Identifier(exprText)]);
      ref.outputWhenComplete = true;
      out.push(ref);
    } else {
      out.push(new Text(trimmed.slice(open, close + 1)));
    }
    i = close + 1;
  }
}

// ----- Body region extraction -----

function extractInlineBodyRange(
  nodeRef: SparkdownSyntaxNodeRef,
): { from: number; to: number } {
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
  name: string,
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
// nodes and they fall through to the legacy InkParser fallback —
// which doesn't know Luau operators (`^`, `//`, `..`). This handler
// lowers the inner expression directly, marks it `outputWhenComplete`
// so the runtime emits its value into the output stream, and appends
// a trailing newline so consecutive bare-`{expr}` lines stay on
// separate lines (matching the implicit-line-break behavior the
// InkParser fallback used to provide).
export function lowerLuauInterpolatedStringExpression(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  // Adjacent same-line interpolation suppression: when the next sibling
  // in the parse tree is another `LuauInterpolatedStringExpression` with
  // no `Newline` separator between us, this one's output is concatenated
  // with the next one's on the same display line. Skip the trailing
  // `"\n"` so `{x}{y}` emits "54" rather than "5\n4\n". Only the LAST
  // interpolation in the chain emits the line break (its next sibling
  // is a `Newline` or end-of-input).
  //
  // Matches ink's `{x}{y}` semantics — both interpolations sit on one
  // line of text and concatenate. Without this guard, sparkdown's
  // per-`{}` lowering produces a stray newline between each adjacent
  // pair, which differs from author expectation when porting fixtures.
  const omitTrailingNewline =
    hasAdjacentInterpolationSibling(nodeRef.node);

  const inlineAlt = tryLowerInlineAlternator(nodeRef.node, ctx);
  if (inlineAlt) {
    return wrapInWeave(
      omitTrailingNewline ? inlineAlt : [...inlineAlt, new Text("\n")],
    );
  }
  const expr = lowerExpressionFromContainer(nodeRef.node, ctx);
  if (!expr) return {};
  expr.outputWhenComplete = true;
  return wrapInWeave(
    omitTrailingNewline ? [expr] : [expr, new Text("\n")],
  );
}

// Returns true when `node` is immediately followed (no Newline between)
// by another `LuauInterpolatedStringExpression` sibling — i.e. they sit
// on the same source line as a `{x}{y}` chain. Intermediate `Whitespace`
// / `ExtraWhitespace` / `Separator` nodes are skipped so `{x} {y}` (with
// a space) also collapses to one line — same author intent.
function hasAdjacentInterpolationSibling(node: SyntaxNode): boolean {
  let cursor: SyntaxNode | null = node.nextSibling;
  while (cursor) {
    if (cursor.name === "Newline") return false;
    if (cursor.name === "LuauInterpolatedStringExpression") return true;
    if (
      cursor.name === "Whitespace" ||
      cursor.name === "ExtraWhitespace" ||
      cursor.name === "Separator" ||
      cursor.name === "OptionalSeparator"
    ) {
      cursor = cursor.nextSibling;
      continue;
    }
    return false;
  }
  return false;
}

export function lowerInlineAction(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const { from, to } = extractInlineBodyRange(nodeRef);
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
    buildDisplayContent(
      nodeRef.node,
      from,
      to,
      ctx,
      "inline",
      "write",
      target,
    ),
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
    buildDisplayContent(
      nodeRef.node,
      from,
      to,
      ctx,
      "block",
      "write",
      target,
    ),
  );
}

// Detects the `{if cond then a else b}` pattern inside an interpolation
// node and lowers it as an inkjs `Conditional` ParsedObject. The
// grammar parses the if-expression as a string of sibling nodes inside
// the interpolation: `LuauIfExpression` (carrying the condition),
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
  const ifExpr = findFirstDirectChild(interpNode, "LuauIfExpression");
  if (!ifExpr) return null;
  const firstCondContent = getDescendent(
    "LuauIfExpressionCondition_content",
    ifExpr,
  );
  if (!firstCondContent) return null;

  // Collect a flat list of (condition-nodes, then-nodes) pairs plus an
  // optional final else-nodes group, walking the sibling stream:
  //   LuauIfExpression(first-cond) → ThenKw → <then-1> →
  //   (ElseifKw → <cond-N> → ThenKw → <then-N>)* →
  //   (ElseKw → <else>)?
  type Branch = { cond: Expression | null; body: SyntaxNode[] };
  const branches: Branch[] = [];
  const firstCond = lowerExpressionFromContainer(firstCondContent, ctx);
  if (!firstCond) return null;
  let current: Branch = { cond: firstCond, body: [] };
  let phase: "wait-then" | "in-body" | "wait-elseif-then" | "in-elseif-cond" =
    "wait-then";
  let elseifCondNodes: SyntaxNode[] = [];
  let sib = ifExpr.nextSibling;
  while (sib) {
    if (sib.name === "LuauThenKeyword") {
      if (phase === "in-elseif-cond") {
        const cond = lowerExpressionFromNodes(elseifCondNodes, ctx);
        current = { cond: cond ?? null, body: [] };
        elseifCondNodes = [];
      }
      phase = "in-body";
    } else if (sib.name === "LuauElseifKeyword") {
      branches.push(current);
      phase = "in-elseif-cond";
    } else if (sib.name === "LuauElseKeyword") {
      branches.push(current);
      current = { cond: null, body: [] };
      phase = "in-body";
    } else if (sib.name === "ExtraWhitespace" || sib.name === "Newline") {
      // skip
    } else if (phase === "in-elseif-cond") {
      elseifCondNodes.push(sib);
    } else if (phase === "in-body") {
      current.body.push(sib);
    }
    sib = sib.nextSibling;
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
function findClosingGlueForAlternator(
  altNode: SyntaxNode,
): SyntaxNode | null {
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

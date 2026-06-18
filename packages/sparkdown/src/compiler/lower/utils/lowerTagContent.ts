import { type SyntaxNode } from "@lezer/common";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { LowerContext } from "../context";

// Shared lowering for a tag body (`# tag {var}`). The grammar classifies a
// `TagContent` body into `TagText` literal runs interleaved with
// `LuauInterpolatedStringExpression` nodes for each `{...}` — so this reads
// those nodes directly instead of re-scanning the raw text for braces
// (GRAMMAR.md §5). Behavior matches the previous regex scanner exactly:
//
//   - `{ident}` (a single bare identifier) → `VariableReference` with
//     `outputWhenComplete` so the runtime substitutes the value.
//   - any other `{expr}` (`{a.b}`, `{math.floor(x)}`, `{a + b}`) → the raw
//     `{...}` source as literal `Text`, so the author sees the un-resolved
//     form rather than a silent failure.
//   - literal text between/around interpolations → `Text`.
//
// The overall body is trimmed (leading/trailing whitespace dropped) to match
// the prior `raw.trim()`; an empty body yields no objects.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function lowerTagContent(
  tagContent: SyntaxNode,
  ctx: LowerContext,
): ParsedObject[] {
  // Build raw text + reference segments first, then trim the literal text at
  // the boundaries so the result equals the old `raw.trim()`-then-scan output.
  type Seg = { kind: "text"; raw: string } | { kind: "ref"; name: string };
  const segs: Seg[] = [];

  // `TagContent` (a begin/end rule) exposes its body inside a generated
  // `TagContent_content` wrapper; descend into it. Fall back to direct
  // children for safety.
  let child =
    firstContentChild(tagContent, `${tagContent.name}_content`) ??
    tagContent.firstChild;
  let cursor = tagContent.from;
  while (child) {
    if (child.name === "LuauInterpolatedStringExpression") {
      // Literal text between the previous cursor and this interpolation.
      if (child.from > cursor) {
        segs.push({ kind: "text", raw: ctx.read(cursor, child.from) });
      }
      // The isolated inner expression text (between `{` and `}`).
      const inner = getInterpolationInnerText(child, ctx).trim();
      if (IDENTIFIER_RE.test(inner)) {
        segs.push({ kind: "ref", name: inner });
      } else {
        // Non-identifier expression → emit the raw `{...}` as literal text.
        segs.push({ kind: "text", raw: ctx.read(child.from, child.to) });
      }
      cursor = child.to;
    }
    child = child.nextSibling;
  }
  // Trailing literal text after the last interpolation (or the whole body
  // when there were none).
  if (tagContent.to > cursor) {
    segs.push({ kind: "text", raw: ctx.read(cursor, tagContent.to) });
  }

  // Trim leading whitespace off the first text seg and trailing whitespace
  // off the last (mirrors the old whole-string `.trim()`).
  trimBoundaryWhitespace(segs);

  const out: ParsedObject[] = [];
  for (const seg of segs) {
    if (seg.kind === "ref") {
      const ref = new VariableReference([new Identifier(seg.name)]);
      ref.outputWhenComplete = true;
      out.push(ref);
    } else if (seg.raw.length > 0) {
      out.push(new Text(seg.raw));
    }
  }
  return out;
}

function trimBoundaryWhitespace(
  segs: { kind: "text" | "ref"; raw?: string; name?: string }[],
): void {
  const first = segs[0];
  if (first && first.kind === "text") {
    first.raw = first.raw!.replace(/^\s+/, "");
  }
  const last = segs[segs.length - 1];
  if (last && last.kind === "text") {
    last.raw = last.raw!.replace(/\s+$/, "");
  }
}

// The text inside an interpolation's `{ ... }` — i.e. the
// `LuauInterpolatedStringExpression_content` span (excludes the braces).
function getInterpolationInnerText(
  node: SyntaxNode,
  ctx: LowerContext,
): string {
  const content = findWrapperChild(
    node,
    "LuauInterpolatedStringExpression_content",
  );
  if (content) return ctx.read(content.from, content.to);
  // Fallback: strip the outer braces from the whole node text.
  const whole = ctx.read(node.from, node.to);
  return whole.replace(/^\{/, "").replace(/\}$/, "");
}

// Return the FIRST child INSIDE the named generated wrapper (e.g.
// `TagContent_content`), so the caller can iterate the wrapper's children.
function firstContentChild(
  parent: SyntaxNode,
  wrapperName: string,
): SyntaxNode | null {
  const wrapper = findWrapperChild(parent, wrapperName);
  return wrapper ? wrapper.firstChild : null;
}

function findWrapperChild(
  parent: SyntaxNode,
  wrapperName: string,
): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === wrapperName) return child;
    child = child.nextSibling;
  }
  return null;
}

import { nodeNameSet } from "../../utils/nodeNameSet";
import { structArrayItemInlineEntry } from "../../utils/structArrayItemInlineEntry";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import {
  UNQUOTED_VALUE_NODES,
  stripTrailingLineComment,
} from "../utils/stripTrailingLineComment";
import { unescapeString } from "../utils/unescapeString";
import { warnValueItemWithEntries } from "../utils/warnValueItemWithEntries";
import { ErrorType } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";

// Typed struct-body parser for `animation`/`theme` blocks. Same colon/indent
// struct grammar as `style`, but values are READ FROM THE GRAMMAR'S VALUE NODES
// (per feedback_ast_lowerer_reads_grammar_tokens) so numbers stay numbers and
// quoted strings stay strings — matching what the `define X as animation` form
// produced (lowerExpression gave real Luau numbers). The style path keeps the
// raw-text `parseScalar` (CSS values are uniformly strings there); animation/
// theme need the number/string distinction (offset/duration/iterations are
// numbers; keyframe CSS props are strings), so they use this typed reader.
//
//   target = layer.self     → scalar: { $type:"layer", $name:"self" } (ref)
//   timing:                 → container (`:` = children): { delay = 0, … }
//     delay = 0             → number 0
//   keyframes:              → container whose children are `-` items → array
//     -                       (bare `-` + indented props = one keyframe object)
//       opacity = "1"       → string "1"
//
// A list item may also carry its first entry on the dash line, with the item's
// remaining entries at the column that entry opens — the same item with the
// dash overlapping the first entry's indent:
//
//   keyframes:                keyframes:
//     - eyes:          ==       -
//         option = closed         eyes:
//       offset = 0.4               option = closed
//                                offset = 0.4

interface NodeLine {
  indent: number;
  node: SyntaxNode; // LuauStructBodyContent
}

const LINE_KIND_NAMES = nodeNameSet([
  "LuauStructScalarProperty",
  "LuauStructObjectHeader",
  "LuauStructArrayItem",
  "LuauStructBareMarker",
  "LuauStructBodyFallback",
]);

const KEY_TOKEN_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

const FIELD_VALUE_NAMES = nodeNameSet([
  "StringFieldValue",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// A two-part `<type>.<name>` reference (e.g. `layer.self`). Anchored +
// identifier-only so it never matches numbers / units / ratios / CSS funcs.
const STRUCT_REFERENCE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

/** DFS in-order: first descendant (or self) whose name is in `names`. */
function firstDescendant(
  node: SyntaxNode,
  names: Set<string>,
): SyntaxNode | null {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    const found = firstDescendant(c, names);
    if (found) return found;
    c = c.nextSibling;
  }
  return null;
}


// A trailing comment makes the grammar match a number, boolean or quoted string
// as a `StylingValue` instead of its own value node. These recognize the
// spellings of the grammar's `NumericFieldValue`, `BooleanFieldValue` and
// `StringFieldValue` rules followed by a comment, so the literal is read as
// that node would read it.
//
// After a complete literal a `--` can only start a Luau comment, so it needs no
// whitespace before it (`1-- note`). A general unquoted value keeps the
// whitespace rule in `stripTrailingLineComment`, because there `--` can belong
// to the value (`var(--x)`). `//` needs whitespace on both sides everywhere.
const TRAILING_COMMENT = String.raw`(?:\s*--|\s+\/\/(?=\s|$)).*`;
const NUMERIC_WITH_COMMENT_RE = new RegExp(
  String.raw`^(-?(?:\d*\.)?\d+|Infinity|NaN)${TRAILING_COMMENT}$`,
);
const BOOLEAN_WITH_COMMENT_RE = new RegExp(
  String.raw`^(true|false)${TRAILING_COMMENT}$`,
);
const QUOTED_WITH_COMMENT_RE = new RegExp(
  String.raw`^"((?:\\.|[^"\\])*)"${TRAILING_COMMENT}$`,
);

function readNumber(text: string): unknown {
  const n = Number(text);
  return Number.isNaN(n) ? text : n;
}

/** Read a value node as a typed scalar (number / boolean / string / ref). */
function readTypedValue(value: SyntaxNode | null, ctx: LowerContext): unknown {
  if (!value) return "";
  if (value.name === "NumericFieldValue") {
    return readNumber(ctx.read(value.from, value.to).trim());
  }
  if (value.name === "BooleanFieldValue") {
    return ctx.read(value.from, value.to).trim() === "true";
  }
  if (value.name === "StringFieldValue") {
    const inner = firstDescendant(value, PLAIN_STRING_CONTENT);
    if (inner) return unescapeString(ctx.read(inner.from, inner.to));
    return ctx.read(value.from, value.to).trim().replace(/^"|"$/g, "");
  }
  // StylingValue / UnquotedStringFieldValue → raw CSS text, or a struct ref.
  // These greedily include any trailing `--`/`//` comment; drop it first.
  let raw = ctx.read(value.from, value.to).trim();
  if (UNQUOTED_VALUE_NODES.has(value.name)) {
    // Matched before stripping, since quoted text may itself contain `--`.
    const numeric = NUMERIC_WITH_COMMENT_RE.exec(raw);
    if (numeric) return readNumber(numeric[1]!);
    const boolean = BOOLEAN_WITH_COMMENT_RE.exec(raw);
    if (boolean) return boolean[1] === "true";
    const quoted = QUOTED_WITH_COMMENT_RE.exec(raw);
    if (quoted) return unescapeString(quoted[1]!);
    raw = stripTrailingLineComment(raw);
  }
  const ref = STRUCT_REFERENCE_RE.exec(raw);
  if (ref) return { $type: ref[1], $name: ref[2] };
  return raw;
}

const PLAIN_STRING_CONTENT = nodeNameSet(["PlainStringContent"]);

/**
 * The text of a `key:` object-header key (everything before the colon). Takes
 * the `LuauStructObjectHeader` node, which excludes any trailing comment.
 */
function headerKey(header: SyntaxNode, ctx: LowerContext): string {
  return ctx.read(header.from, header.to).trim().replace(/:\s*$/, "").trim();
}

/** Collect each body line's `LuauStructBodyContent` node + indent column. */
function collectNodeLines(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): NodeLine[] {
  const lines: NodeLine[] = [];
  if (!contentNode) return lines;
  const walk = (node: SyntaxNode | null) => {
    let child = node?.firstChild ?? null;
    while (child) {
      if (child.name === "LuauStructBodyContent") {
        const text = ctx.read(child.from, child.to).trim();
        if (text && !text.startsWith("--")) {
          lines.push({ indent: ctx.characterNumber(child.from), node: child });
          pushInlineEntryLine(lines, child, ctx);
        }
      } else {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(contentNode);
  return lines;
}

/**
 * A collapsed list item (`- eyes:` / `- offset = 0.4`) carries its first entry
 * on the dash line. Follow the item's line with that entry as a line of its
 * own, at the column the entry starts in — the shape the expanded form
 * already has — so the block parser below needs no case for it and the two
 * spellings cannot drift apart.
 */
function pushInlineEntryLine(
  lines: NodeLine[],
  content: SyntaxNode,
  ctx: LowerContext,
): void {
  const kind = firstDescendant(content, LINE_KIND_NAMES);
  if (kind?.name !== "LuauStructArrayItem") return;
  const entry = structArrayItemInlineEntry(kind);
  if (!entry) return;
  lines.push({ indent: ctx.characterNumber(entry.from), node: entry });
}

function nextChildIndent(
  lines: NodeLine[],
  i: number,
  indent: number,
): number | null {
  const next = lines[i + 1];
  if (next && next.indent > indent) return next.indent;
  return null;
}

// A `keyframes:` child header that names a position on the animation's
// timeline, the way a CSS `@keyframes` selector does: `from`, `to`, or a
// percentage. Any percentage is matched here, including one outside 0-100, so
// an out-of-range position is reported rather than silently read as an
// ordinary property name.
//
// The percentage alternatives accept a leading dot (`.5%`) as well as a
// leading digit, matching the grammar's `LuauKeyframeSelector` exactly. A key
// the grammar highlights as a position but this pattern rejected would take
// its whole `keyframes:` block back to the ordinary-property reading, with no
// diagnostic, so the two patterns have to agree on every spelling.
const KEYFRAME_POSITION_RE =
  /^(?:from|to|([+-]?(?:\d+(?:\.\d+)?|\.\d+))%)$/;

/** The 0-to-1 offset a position key names, or null if it names no position. */
function keyframeOffset(key: string): number | null {
  const m = KEYFRAME_POSITION_RE.exec(key);
  if (!m) return null;
  if (key === "from") return 0;
  if (key === "to") return 1;
  return Number(m[1]) / 100;
}

interface HeaderEntry {
  key: string;
  node: SyntaxNode; // the header's LuauStructBodyContent line
  value: unknown;
}

function diagnose(
  sink: InkDiagnostic[] | undefined,
  ctx: LowerContext,
  node: SyntaxNode,
  message: string,
): void {
  if (!sink) return;
  sink.push({
    message,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(node.from) + 1,
      endLineNumber: ctx.lineNumber(node.to) + 1,
      startCharacterNumber: ctx.characterNumber(node.from) + 1,
      endCharacterNumber: ctx.characterNumber(node.to) + 1,
    },
  });
}

/**
 * Rewrite a `keyframes:` container written with position keys into the array
 * of keyframe objects the engine reads, each carrying the `offset` its key
 * named. The two forms mean the same thing, so this runs before any consumer
 * sees the value and nothing downstream needs to know which form was written.
 *
 *   keyframes:            keyframes:
 *     from:                 -
 *       opacity = "0"         offset = 0
 *     40%:          ===>      opacity = "0"
 *       opacity = "1"       -
 *                             offset = 0.4
 *                             opacity = "1"
 *
 * Returns null when the container is not in the keyed form, in which case the
 * caller keeps the value parseBlock already built.
 */
function keyframesFromPositionKeys(
  headers: HeaderEntry[],
  hasArrayItems: boolean,
  ctx: LowerContext,
  sink: InkDiagnostic[] | undefined,
): unknown[] | null {
  if (headers.length === 0) return null;
  const positions = headers.map((h) => keyframeOffset(h.key));
  // Every header must name a position. A container holding ordinary property
  // headers is left exactly as it was written.
  if (positions.some((p) => p == null)) return null;

  if (hasArrayItems) {
    diagnose(
      sink,
      ctx,
      headers[0]!.node,
      "Keyframe positions and `-` list items cannot be mixed in one `keyframes:` block. Write every keyframe as a position (`from:`, `40%:`, `to:`) or every keyframe as a `-` item with an `offset`.",
    );
    return null;
  }

  const seen = new Set<number>();
  const frames: { offset: number; frame: Record<string, unknown> }[] = [];
  headers.forEach((h, idx) => {
    const offset = positions[idx]!;
    if (offset < 0 || offset > 1) {
      diagnose(
        sink,
        ctx,
        h.node,
        `Keyframe position \`${h.key}\` must be between 0% and 100%.`,
      );
    }
    if (seen.has(offset)) {
      diagnose(
        sink,
        ctx,
        h.node,
        `Duplicate keyframe position \`${h.key}\`. Each position may appear once in a \`keyframes:\` block (\`from\` is 0% and \`to\` is 100%).`,
      );
    }
    seen.add(offset);
    const body = h.value;
    const props =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    // The position key is what the keyframe's place is sorted by, so it also
    // wins over an `offset` property written inside the keyframe body.
    frames.push({ offset, frame: { ...props, offset } });
  });

  // Sort by position so the written order does not matter. `sort` is stable in
  // every engine this runs on, so keyframes sharing a position keep their
  // written order (a case that is already reported as a duplicate).
  frames.sort((a, b) => a.offset - b.offset);
  return frames.map((f) => f.frame);
}

function parseBlock(
  lines: NodeLine[],
  start: number,
  indent: number,
  ctx: LowerContext,
  sink?: InkDiagnostic[],
): {
  value: Record<string, unknown> | unknown[];
  next: number;
  headers: HeaderEntry[];
  hasArrayItems: boolean;
} {
  const obj: Record<string, unknown> = {};
  const headers: HeaderEntry[] = [];
  let arr: unknown[] | null = null;
  let i = start;
  while (i < lines.length && lines[i]!.indent >= indent) {
    if (lines[i]!.indent > indent) {
      i += 1; // defensive: over-indented orphan
      continue;
    }
    const content = lines[i]!.node;
    const kind = firstDescendant(content, LINE_KIND_NAMES);
    const childIndent = nextChildIndent(lines, i, indent);

    if (kind?.name === "LuauStructArrayItem") {
      // `-` item. Entries indented beneath (or carried on the dash line, which
      // `collectNodeLines` has already followed with an entry line) → object;
      // `- scalar` → scalar.
      arr = arr ?? [];
      if (childIndent != null) {
        warnValueItemWithEntries(kind, ctx, sink);
        const sub = parseBlock(lines, i + 1, childIndent, ctx, sink);
        arr.push(sub.value);
        i = sub.next;
      } else {
        const value = firstDescendant(kind, FIELD_VALUE_NAMES);
        if (value) arr.push(readTypedValue(value, ctx));
        i += 1;
      }
      continue;
    }

    if (kind?.name === "LuauStructObjectHeader") {
      // `key:` → container (children = the value).
      const key = headerKey(kind, ctx);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent, ctx, sink);
        // A `keyframes:` container may be written with position keys instead
        // of `-` items; normalize it to the array form the engine consumes.
        const keyed =
          key === "keyframes"
            ? keyframesFromPositionKeys(
                sub.headers,
                sub.hasArrayItems,
                ctx,
                sink,
              )
            : null;
        obj[key] = keyed ?? sub.value;
        headers.push({ key, node: content, value: obj[key] });
        i = sub.next;
      } else {
        obj[key] = {};
        headers.push({ key, node: content, value: obj[key] });
        i += 1;
      }
      continue;
    }

    if (kind?.name === "LuauStructScalarProperty") {
      // `key = value` → typed scalar.
      const keyNode = firstDescendant(kind, KEY_TOKEN_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) obj[key] = readTypedValue(firstDescendant(kind, FIELD_VALUE_NAMES), ctx);
      i += 1;
      continue;
    }

    // Bare marker / fallback → empty-object leaf keyed by the line text.
    const text = ctx.read(content.from, content.to).trim();
    if (text) obj[text] = {};
    i += 1;
  }
  return {
    value: arr ?? obj,
    next: i,
    headers,
    hasArrayItems: arr != null,
  };
}

/** Build the typed nested struct for an `animation`/`theme` body. */
export function parseStructBodyTyped(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
  sink?: InkDiagnostic[],
): Record<string, unknown> {
  const lines = collectNodeLines(contentNode, ctx);
  if (lines.length === 0) return {};
  const result = parseBlock(lines, 0, lines[0]!.indent, ctx, sink);
  return Array.isArray(result.value)
    ? { ...result.value }
    : (result.value as Record<string, unknown>);
}

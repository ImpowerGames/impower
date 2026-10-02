import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { structValueNode } from "../utils/structValueNode";
import {
  type StructEntry,
} from "../utils/structBodyEntries";
import {
  sparkleClosureAttributeEnd,
  sparkleElementParts,
  sparklePartNodes,
} from "../utils/sparkleBlockEntries";
import { unescapeString } from "../utils/unescapeString";

// Static struct reader for explicit block entries and layout elements.

// The grammar's value tokens a scalar / array-item value lowers from (CSS-like
// tokens, quoted strings, numbers, booleans). Read by name so the lowerer never
// re-splits the raw line on `=`.
const FIELD_VALUE_NAMES: ReadonlySet<string> = nodeNameSet([
  "StringFieldValueInterpolated",
  "StringFieldValue",
  "LuauElementContentStringInterpolated",
  "LuauElementContentStringPlain",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// The grammar's key tokens for a scalar property (`key = value`).
const KEY_TOKEN_NAMES: ReadonlySet<string> = nodeNameSet([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

// DFS in-order: the first descendant (or self) whose name is in `names`.
function firstDescendant(
  node: SyntaxNode,
  names: ReadonlySet<string>,
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

const ATTRIBUTE_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauEventAttribute",
  "LuauPropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparklePropAttribute",
  "LuauSparkleEventClosureAttribute",
]);

// Spans of inline element attributes (`@event=…`, `#prop=…`) within a node, in
// source order. Used to excise reactive attributes from the static struct text
// (they are not part of the engine-consumed struct).
function attributeRanges(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, ATTRIBUTE_NAMES, true);
}

// The nodes named in `names` within `node`, outside its inline attributes (or,
// with `attributes` set, the attributes themselves), as spans to remove.
function nodesOutsideAttributes(
  node: SyntaxNode,
  names: ReadonlySet<string>,
  attributes = false,
): TextEdit[] {
  const ranges: TextEdit[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (ATTRIBUTE_NAMES.has(c.name)) {
        if (attributes) ranges.push({ from: c.from, to: c.to, text: "" });
      } else if (!attributes && names.has(c.name)) {
        ranges.push({ from: c.from, to: c.to, text: "" });
      } else {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return ranges;
}

// The `.` of each `.name` class in an element's key, outside its attributes.
// In a layout or component body the static struct keys an element by its tag
// and classes separated by spaces (`mask.shadow_1` is keyed `mask shadow_1`,
// as `mask shadow_1` is), because the engine splits struct paths on `.`. A
// `.` the key already has whitespace before (`choice .0`) is dropped, so
// the key is `choice 0` either way.
function classDots(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, CLASS_DOT_NAMES).map((r) => ({
    ...r,
    separator: true,
  }));
}

const CLASS_DOT_NAMES: ReadonlySet<string> = nodeNameSet(["LuauSparkleClassDot"]);

// A node's source text with all inline-attribute spans removed, so the static
// struct sees only the structural part (`column #gap=16` → `column `,
// `button "Use" @click=x` → `button "Use" `). In a layout or component body
// (`elementKeys`) a class's `.` reads as a space.
function textWithoutAttributes(
  node: SyntaxNode,
  ctx: LowerContext,
  elementKeys = false,
): string {
  return textExcluding(node, ctx, [
    ...attributeRanges(node),
    ...(elementKeys ? classDots(node) : []),
  ]);
}

/** A span of source text to replace. */
interface TextEdit {
  from: number;
  to: number;
  /** What the span reads as; removed when empty. */
  text?: string;
  /** The span reads as one space, or as nothing after whitespace. */
  separator?: boolean;
}

// A node's source text with the given spans replaced (sorted defensively,
// since callers may concatenate ranges from more than one source).
function textExcluding(
  node: SyntaxNode,
  ctx: LowerContext,
  ranges: TextEdit[],
  to: number = node.to,
): string {
  if (ranges.length === 0) return ctx.read(node.from, to);
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  let result = "";
  let pos = node.from;
  for (const { from, to: end, text, separator } of sorted) {
    if (from > pos) result += ctx.read(pos, from);
    if (from >= pos && separator) {
      if (result && !/\s$/.test(result)) result += " ";
    } else if (from >= pos && text) result += text;
    pos = Math.max(pos, end);
  }
  if (to > pos) result += ctx.read(pos, to);
  return result;
}

export interface StructBodyOptions {
  /**
   * The body is a `layout` or `component` body, whose elements are keyed by
   * their tag and classes separated by spaces.
   */
  elementKeys?: boolean;
}

export function parseStructBody(
  entries: StructEntry[],
  ctx: LowerContext,
  options: StructBodyOptions = {},
): Record<string, unknown> {
  const result = evaluate(entries, ctx, !!options.elementKeys);
  // A bare body (top-level array) is unusual for UI; coerce to object.
  return Array.isArray(result) ? { ...result } : result;
}

// Comments in an element's head, which are no part of its key.
const COMMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauLineComment",
  "LuauBlockComment",
  "LuauDocLineComment",
  "LuauStructBlockSlashComment",
]);

// A piece of an element's text: the source from `node.from` to `to`, read
// with `edits` applied.
interface ElementSegment {
  node: SyntaxNode;
  to: number;
  edits: TextEdit[];
  /** The node the value is looked for in, if any. */
  value: SyntaxNode | null;
}

// An event closure that goes on at the next line, which a segment's text
// never holds: it is an attribute, and it spans lines.
const CLOSURE_ATTRIBUTE = "LuauSparkleEventClosureAttribute";

// Segments read as one line. Segments that follow one another directly are
// one run, read as one range with all their edits, so an element written on
// one line reads exactly as its own text did; runs are joined with a space.
function joinSegments(
  segments: ElementSegment[],
  read: (from: SyntaxNode, edits: TextEdit[], to: number) => string,
): string {
  const runs: ElementSegment[][] = [];
  for (const segment of segments) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && segment.node.from === last.to) run.push(segment);
    else runs.push([segment]);
  }
  return runs
    .map((run) =>
      read(
        run[0]!.node,
        run.flatMap((s) => s.edits),
        run[run.length - 1]!.to,
      ),
    )
    .join(" ");
}

function elementSegments(entry: StructEntry): ElementSegment[] {
  const part = (node: SyntaxNode): ElementSegment =>
    node.name === CLOSURE_ATTRIBUTE
      ? // The closure alone: the run of parts after its `}` follows it as a
        // segment of its own.
        { node, to: sparkleClosureAttributeEnd(node), edits: [], value: null }
      : {
          node,
          to: node.to,
          edits: [
            ...attributeRanges(node),
            ...nodesOutsideAttributes(node, COMMENT_NAMES),
            ...classDots(node),
          ],
          value: node,
        };
  const segments: ElementSegment[] = [];

    const element = entry.shape;
    // Its name and a call's arguments, read as written.
    const { beginTo } = sparkleElementParts(element);
    segments.push({ node: element, to: beginTo, edits: [], value: null });
    for (const node of sparklePartNodes(element)) segments.push(part(node));
  for (const node of entry.continuations ?? []) segments.push(part(node));
  return segments;
}

function evaluateElement(
  entry: StructEntry,
  obj: Record<string, unknown>,
  ctx: LowerContext,
  elementKeys: boolean,
): void {
  const segments = elementSegments(entry);
  const keyOf = (value: SyntaxNode | null) =>
    oneSpace(
      joinSegments(
        segments
          .filter((s) => s.node.name !== CLOSURE_ATTRIBUTE)
          // Content in later continuation/closure segments is not part of
          // the key, even when the first value came from an earlier run.
          .map((s) => value && s.value ? {
            ...s,
            edits: [...s.edits, ...nodesOutsideAttributes(s.node, FIELD_VALUE_NAMES)],
          } : s),
        (node, edits, to) =>
          textExcluding(
            node,
            ctx,
            edits,
            to,
          ),
      ),
    );
  if (entry.kind === "header") {
    obj[keyOf(null)] = entry.children
      ? evaluate(entry.children, ctx, elementKeys)
      : {};
    return;
  }
  let valueNode: SyntaxNode | null = null;
  for (const segment of segments) {
    if (valueNode) break;
    if (segment.value && segment.node.name !== CLOSURE_ATTRIBUTE) {
      valueNode = firstDescendant(segment.value, FIELD_VALUE_NAMES);
    }
  }
  const key = keyOf(valueNode);
  if (!key) return;
  obj[key] = valueNode ? parseScalar(readValue(valueNode, ctx)) : {};
}

function evaluate(
  entries: StructEntry[],
  ctx: LowerContext,
  elementKeys: boolean,
): Record<string, unknown> | unknown[] {
  const obj: Record<string, unknown> = {};
  let arr: unknown[] | null = null;
  for (const entry of entries) {
    const shape = entry.shape;

    if (entry.element || entry.continuations) {
      evaluateElement(entry, obj, ctx, elementKeys);
    } else if (entry.kind === "item") {
      arr = arr ?? [];
      if (entry.children) {
        arr.push(evaluate(entry.children, ctx, elementKeys));
      } else {
        const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
        if (valueNode) arr.push(parseScalar(readValue(valueNode, ctx)));
      }
    } else if (entry.kind === "header") {
      // Nested brace block — covers `key { … }`, `> selector { … }`,
      // `@breakpoint { … }`, and element headers with inline attributes
      // (`column #gap=16 { … }`). The key is the header text before `{`, with any
      // `@event`/`#prop` attributes excised so the static struct keys on the
      // structural part only.
      const key = entry.key
        ? textWithoutAttributes(entry.key, ctx).trim()
        : "";
      obj[key] = entry.children
        ? evaluate(entry.children, ctx, elementKeys)
        : {};
    } else if (entry.kind === "property") {
      // `key = value` → scalar. Key + value read from the grammar tokens.
      const keyNode = firstDescendant(shape, KEY_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) obj[key] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
    }
  }
  return arr ?? obj;
}

// An element's key in a layout or component body with each run of spaces and
// tabs outside a quoted run read as one space, and trimmed, so removing an
// attribute, a comment or a class's `.` never leaves two spaces between its
// parts (`image @click=go .b` and `choice .0` are keyed `image b` and
// `choice 0`, as `image.b @click=go` and `choice.0` are). The engine splits
// element keys on single spaces.
function oneSpace(key: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < key.length; i++) {
    const c = key[i]!;
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < key.length) out += key[++i];
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === " " || c === "\t") {
      if (!out.endsWith(" ")) out += " ";
    } else {
      out += c;
    }
  }
  return out.trim();
}

// Read a value node's text. Interpolation-aware content strings and plain
// content strings keep their surrounding quotes here so `parseScalar` (the
// shared value coercion) strips them and processes escapes uniformly; all other
// value tokens (numbers, CSS funcs, struct refs) come through as raw text.
// A value with a trailing comment reads only its value node.
function readValue(value: SyntaxNode, ctx: LowerContext): string {
  const node = structValueNode(value);
  return ctx.read(node.from, node.to).trim();
}

// A two-part struct reference: `<type>.<name>` where BOTH parts are bare
// identifiers (e.g. `image.ui_dialogue_box`, `font.courier_prime_sans`).
// Anchored + identifier-only so it never matches numbers (`1.5`), units
// (`0.5cqh`), ratios (`1341/381`), or CSS functions (`translateY(-100%)`).
const STRUCT_REFERENCE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

function parseScalar(raw: string): unknown {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    // Quoted string literal: strip quotes and process escapes. The line-based
    // body can't carry a literal newline, so multi-line values (e.g. a CSS
    // `font_family` stack) are written on one line with `\n` escapes; unescape
    // them here so the value round-trips. Mirrors lowerExpression's string
    // escape handling.
    return unescapeString(s.slice(1, -1));
  }
  // `true` / `false` parse to booleans (Luau keywords). No CSS value is the
  // bare word `true`/`false`, so this is safe — and lets `$recursive = true`
  // round-trip as a boolean rather than the string "true".
  if (s === "true") {
    return true;
  }
  if (s === "false") {
    return false;
  }
  const ref = STRUCT_REFERENCE_RE.exec(s);
  if (ref) {
    return { $type: ref[1], $name: ref[2] };
  }
  return s;
}

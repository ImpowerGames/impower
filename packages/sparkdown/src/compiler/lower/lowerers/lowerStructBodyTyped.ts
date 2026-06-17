import { type SyntaxNode } from "@lezer/common";
import { LowerContext } from "../context";

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

interface NodeLine {
  indent: number;
  node: SyntaxNode; // LuauStructBodyContent
}

const LINE_KIND_NAMES = new Set([
  "LuauStructScalarProperty",
  "LuauStructObjectHeader",
  "LuauStructArrayItem",
  "LuauStructBareMarker",
  "LuauStructBodyFallback",
]);

const KEY_TOKEN_NAMES = new Set([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

const FIELD_VALUE_NAMES = new Set([
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

function unescapeString(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return c;
    }
  });
}

/** Read a value node as a typed scalar (number / boolean / string / ref). */
function readTypedValue(value: SyntaxNode | null, ctx: LowerContext): unknown {
  if (!value) return "";
  if (value.name === "NumericFieldValue") {
    const n = Number(ctx.read(value.from, value.to).trim());
    return Number.isNaN(n) ? ctx.read(value.from, value.to).trim() : n;
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
  const raw = ctx.read(value.from, value.to).trim();
  const ref = STRUCT_REFERENCE_RE.exec(raw);
  if (ref) return { $type: ref[1], $name: ref[2] };
  return raw;
}

const PLAIN_STRING_CONTENT = new Set(["PlainStringContent"]);

/** The text of a `key:` object-header key (everything before the colon). */
function headerKey(content: SyntaxNode, ctx: LowerContext): string {
  return ctx.read(content.from, content.to).trim().replace(/:\s*$/, "").trim();
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

function nextChildIndent(
  lines: NodeLine[],
  i: number,
  indent: number,
): number | null {
  const next = lines[i + 1];
  if (next && next.indent > indent) return next.indent;
  return null;
}

function parseBlock(
  lines: NodeLine[],
  start: number,
  indent: number,
  ctx: LowerContext,
): { value: Record<string, unknown> | unknown[]; next: number } {
  const obj: Record<string, unknown> = {};
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
      // `-` item: bare `-` + indented props → object; `- scalar` → scalar.
      arr = arr ?? [];
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent, ctx);
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
      const key = headerKey(content, ctx);
      if (childIndent != null) {
        const sub = parseBlock(lines, i + 1, childIndent, ctx);
        obj[key] = sub.value;
        i = sub.next;
      } else {
        obj[key] = {};
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
  return { value: arr ?? obj, next: i };
}

/** Build the typed nested struct for an `animation`/`theme` body. */
export function parseStructBodyTyped(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): Record<string, unknown> {
  const lines = collectNodeLines(contentNode, ctx);
  if (lines.length === 0) return {};
  const result = parseBlock(lines, 0, lines[0]!.indent, ctx);
  return Array.isArray(result.value)
    ? { ...result.value }
    : (result.value as Record<string, unknown>);
}

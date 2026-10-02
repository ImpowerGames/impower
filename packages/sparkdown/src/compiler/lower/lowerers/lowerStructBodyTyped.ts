import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";
import { structValueNode } from "../utils/structValueNode";
import {
  readStructBodyEntries,
  type StructEntry,
  type StructEntryKind,
} from "../utils/structBodyEntries";
import { unescapeString } from "../utils/unescapeString";
import { warnValueItemWithEntries } from "../utils/warnValueItemWithEntries";
import { ErrorType } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";

// Typed struct-body parser for `animation`/`theme`/`morph` blocks. Same struct
// grammar as `style`, but values are READ FROM THE GRAMMAR'S VALUE NODES
// (per feedback_ast_lowerer_reads_grammar_tokens) so numbers stay numbers and
// quoted strings stay strings — matching what the `define X as animation` form
// produced (lowerExpression gave real Luau numbers). The style path keeps the
// raw-text `parseScalar` (CSS values are uniformly strings there); animation/
// theme need the number/string distinction (offset/duration/iterations are
// numbers; keyframe CSS props are strings), so they use this typed reader.
//
//   target = layer.self      → scalar: { $type:"layer", $name:"self" } (ref)
//   timing {                 → container: { delay = 0, … }
//     delay = 0              → number 0
//   }
//   keyframes {              → container whose entries are bare → array
//     { opacity = "1" }        (a bare `{ … }` = one keyframe object)
//   }
//
// The body is read as the entry tree of `readStructBodyEntries`, which gives
// the indented form (`timing:` with indented lines, `-` items, including a
// collapsed `- eyes:` item) and the braced form the same entries, so both
// lower to the same struct.

/** A source range, as absolute document offsets. */
export interface SourceSpan {
  from: number;
  to: number;
}

/**
 * Where each part of a parsed container was written. `keys` holds the key of
 * every `key = value` entry and header, `values` the value of every scalar
 * entry, and `lines` where every entry was written (an indented entry's line,
 * a block's header and `{`). An array records where its items were written in
 * `items` and the values of scalar items in `itemValues`. `line` is where the
 * container was opened: its header, its list item, or, for a keyframe written
 * as a position, that position's header.
 */
export interface StructSource {
  line?: SourceSpan;
  keys: Map<string, SourceSpan>;
  values: Map<string, SourceSpan>;
  lines: Map<string, SourceSpan>;
  items: SourceSpan[];
  itemValues: (SourceSpan | null)[];
}

export interface TypedStructBodyOptions {
  /**
   * Scalar keys whose values are literal text: the value is kept exactly as
   * written (quotes removed) instead of being read as a number, boolean or
   * `type.name` reference, so `01` stays `"01"` and `eyes.closed` stays
   * `"eyes.closed"`.
   */
  literalKeys?: ReadonlySet<string>;
  /** Container keys whose `-` items are literal text, as for `literalKeys`. */
  literalListKeys?: ReadonlySet<string>;
  /** Receives the source of every container the parse builds. */
  sources?: WeakMap<object, StructSource>;
}

function newSource(line?: SourceSpan): StructSource {
  return {
    line,
    keys: new Map(),
    values: new Map(),
    lines: new Map(),
    items: [],
    itemValues: [],
  };
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

function readNumber(text: string): unknown {
  const n = Number(text);
  return Number.isNaN(n) ? text : n;
}

/** Read a value node as a typed scalar (number / boolean / string / ref). */
function readTypedValue(
  field: SyntaxNode | null,
  ctx: LowerContext,
): unknown {
  if (!field) return "";
  const value = structValueNode(field);
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
  // Any other value → raw CSS text, or a struct ref.
  const raw = ctx.read(value.from, value.to).trim();
  const ref = STRUCT_REFERENCE_RE.exec(raw);
  if (ref) return { $type: ref[1], $name: ref[2] };
  return raw;
}

/**
 * Read a value node as the literal text it was written as: a quoted string
 * loses its quotes and escapes, anything else keeps its spelling. Nothing is
 * converted to a number, boolean or reference.
 */
function readLiteralValue(
  field: SyntaxNode | null,
  ctx: LowerContext,
): string {
  if (!field) return "";
  const value = structValueNode(field);
  if (value.name === "StringFieldValue") {
    const inner = firstDescendant(value, PLAIN_STRING_CONTENT);
    if (inner) return unescapeString(ctx.read(inner.from, inner.to));
    return ctx.read(value.from, value.to).trim().replace(/^"|"$/g, "");
  }
  return ctx.read(value.from, value.to).trim();
}

const PLAIN_STRING_CONTENT = nodeNameSet(["PlainStringContent"]);

/**
 * The text of a header's key. An indented header's is everything before its
 * colon, read from the `LuauStructObjectHeader` node, which excludes any
 * trailing comment; a block's is its `LuauStructBlockKey`.
 */
function headerKey(entry: StructEntry, ctx: LowerContext): string {
  if (entry.key) return ctx.read(entry.key.from, entry.key.to).trim();
  const header = entry.shape;
  return ctx.read(header.from, header.to).trim().replace(/:\s*$/, "").trim();
}

const OBJECT_KEY = nodeNameSet(["LuauStructObjectKey"]);

/** A header's key node, without an indented header's colon. */
function headerKeyNode(entry: StructEntry): SyntaxNode {
  return entry.key ?? firstDescendant(entry.shape, OBJECT_KEY) ?? entry.shape;
}

/** How each indented line reads: the grammar's shape for it, or none. */
function classifyLine(
  content: SyntaxNode,
  ctx: LowerContext,
): { kind: StructEntryKind; shape: SyntaxNode } | null {
  const text = ctx.read(content.from, content.to).trim();
  if (!text || text.startsWith("--")) return null;
  const shape = firstDescendant(content, LINE_KIND_NAMES);
  switch (shape?.name) {
    case "LuauStructArrayItem":
      return { kind: "item", shape };
    case "LuauStructObjectHeader":
      return { kind: "header", shape };
    case "LuauStructScalarProperty":
      return { kind: "property", shape };
    default:
      return { kind: "other", shape: shape ?? content };
  }
}

const KEYFRAME_SELECTOR = nodeNameSet(["LuauKeyframeSelector"]);

/**
 * The 0-to-1 offset a header names when its key is a keyframe position: `from`,
 * `to`, or a percentage, the way a CSS `@keyframes` selector names one. The
 * grammar marks a key that is entirely a position as a `LuauKeyframeSelector`,
 * in an indented `from:` header and a `from { … }` block alike. Any percentage
 * is a position, including one outside 0-100, so an out-of-range position is
 * reported rather than silently read as an ordinary property name.
 */
function keyframeOffset(
  keyNode: SyntaxNode,
  key: string,
  ctx: LowerContext,
): number | null {
  const selector = firstDescendant(keyNode, KEYFRAME_SELECTOR);
  if (!selector || ctx.read(selector.from, selector.to) !== key) return null;
  if (key === "from") return 0;
  if (key === "to") return 1;
  // The selector is a number followed by `%`; read the number.
  return Number(key.slice(0, -1)) / 100;
}

interface HeaderEntry {
  key: string;
  node: SourceSpan; // where the header was written
  keyNode: SourceSpan; // the header's key, without an indented header's colon
  offset: number | null; // the keyframe position the key names, if any
  value: unknown;
}

function diagnose(
  sink: InkDiagnostic[] | undefined,
  ctx: LowerContext,
  node: SourceSpan,
  message: string,
): void {
  if (!sink) return;
  sink.push({
    message,
    severity: ErrorType.Error,
    source: statementSource(node, ctx),
  });
}

/**
 * Rewrite a `keyframes { … }` container written with position headers into
 * the array of keyframe objects the engine reads, each carrying the `offset`
 * its position named. The two forms mean the same thing, so this runs before
 * any consumer sees the value and nothing downstream needs to know which form
 * was written.
 *
 *   keyframes {                keyframes {
 *     from { opacity = "0" }     { offset = 0; opacity = "0" }
 *     40% { opacity = "1" }  →   { offset = 0.4; opacity = "1" }
 *   }                          }
 *
 * Returns null when the container is not in the position form, in which case
 * the caller keeps the value it already built.
 */
function keyframesFromPositionKeys(
  headers: HeaderEntry[],
  hasArrayItems: boolean,
  ctx: LowerContext,
  sink: InkDiagnostic[] | undefined,
  sources?: WeakMap<object, StructSource>,
): unknown[] | null {
  if (headers.length === 0) return null;
  // Every header must name a position. A container holding ordinary property
  // headers is left exactly as it was written.
  if (headers.some((h) => h.offset == null)) return null;

  if (hasArrayItems) {
    diagnose(
      sink,
      ctx,
      headers[0]!.node,
      "Keyframe positions and list entries cannot be mixed in one `keyframes { … }` block. Write every keyframe as a position (`from { … }`, `40% { … }`, `to { … }`) or every keyframe as a `{ … }` entry with an `offset`.",
    );
    return null;
  }

  const seen = new Set<number>();
  const frames: {
    offset: number;
    frame: Record<string, unknown>;
    header: HeaderEntry;
  }[] = [];
  for (const h of headers) {
    const offset = h.offset!;
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
        `Duplicate keyframe position \`${h.key}\`. Each position may appear once in a \`keyframes { … }\` block (\`from\` is 0% and \`to\` is 100%).`,
      );
    }
    seen.add(offset);
    const body = h.value;
    const props =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    // The position is what the keyframe's place is sorted by, so it also wins
    // over an `offset` property written inside the keyframe body.
    frames.push({ offset, frame: { ...props, offset }, header: h });
  }

  // Sort by position so the written order does not matter. `sort` is stable in
  // every engine this runs on, so keyframes sharing a position keep their
  // written order (a case that is already reported as a duplicate).
  frames.sort((a, b) => a.offset - b.offset);
  const result = frames.map((f) => f.frame);
  if (sources) {
    // Each keyframe was written as its position's header, and that key is
    // where its `offset` came from.
    const list = newSource();
    for (const f of frames) {
      const body = f.header.value;
      const bodySource =
        body && typeof body === "object" ? sources.get(body) : undefined;
      const frameSource: StructSource = {
        ...(bodySource ?? newSource()),
        keys: new Map(bodySource?.keys),
        lines: new Map(bodySource?.lines),
        line: f.header.node,
      };
      frameSource.keys.set("offset", f.header.keyNode);
      frameSource.lines.set("offset", f.header.node);
      sources.set(f.frame, frameSource);
      list.items.push(f.header.node);
      list.itemValues.push(null);
    }
    sources.set(result, list);
  }
  return result;
}

/** Evaluate a container's entries into its value. */
function evaluate(
  entries: StructEntry[],
  ctx: LowerContext,
  sink?: InkDiagnostic[],
  options: TypedStructBodyOptions = {},
  containerKey = "",
  containerLine?: SourceSpan,
): {
  value: Record<string, unknown> | unknown[];
  headers: HeaderEntry[];
  hasArrayItems: boolean;
} {
  const obj: Record<string, unknown> = {};
  const headers: HeaderEntry[] = [];
  const source = newSource(containerLine);
  const literalItems = options.literalListKeys?.has(containerKey) ?? false;
  let arr: unknown[] | null = null;
  for (const entry of entries) {
    const shape = entry.shape;
    const line = entry.line;

    if (entry.kind === "item") {
      // A list item. Entries beneath it (indented, carried on the dash line,
      // or inside a bare `{ … }`) → object; a value → scalar.
      arr = arr ?? [];
      if (entry.children) {
        if (!entry.braced) warnValueItemWithEntries(shape, ctx, sink);
        const sub = evaluate(entry.children, ctx, sink, options, "", line);
        arr.push(sub.value);
        source.items.push(line);
        source.itemValues.push(null);
      } else {
        const value = firstDescendant(shape, FIELD_VALUE_NAMES);
        if (value) {
          arr.push(
            literalItems
              ? readLiteralValue(value, ctx)
              : readTypedValue(value, ctx),
          );
          source.items.push(line);
          source.itemValues.push(value);
        }
      }
      continue;
    }

    if (entry.kind === "header") {
      // `key:` / `key { … }` → container (its entries = the value).
      const key = headerKey(entry, ctx);
      const keyNode = headerKeyNode(entry);
      if (entry.children) {
        const sub = evaluate(entry.children, ctx, sink, options, key, line);
        // A `keyframes` container may be written with position headers
        // instead of list items; normalize it to the array form the engine
        // consumes.
        const keyed =
          key === "keyframes"
            ? keyframesFromPositionKeys(
                sub.headers,
                sub.hasArrayItems,
                ctx,
                sink,
                options.sources,
              )
            : null;
        obj[key] = keyed ?? sub.value;
      } else {
        obj[key] = {};
        options.sources?.set(obj[key] as object, newSource(line));
      }
      headers.push({
        key,
        node: line,
        keyNode,
        offset: keyframeOffset(keyNode, key, ctx),
        value: obj[key],
      });
      source.keys.set(key, keyNode);
      source.lines.set(key, line);
      continue;
    }

    if (entry.kind === "property") {
      // `key = value` → typed scalar.
      const keyNode = firstDescendant(shape, KEY_TOKEN_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) {
        const value = firstDescendant(shape, FIELD_VALUE_NAMES);
        obj[key] = options.literalKeys?.has(key)
          ? readLiteralValue(value, ctx)
          : readTypedValue(value, ctx);
        source.keys.set(key, keyNode!);
        source.lines.set(key, line);
        if (value) source.values.set(key, value);
      }
      continue;
    }

    // Bare marker / fallback → empty-object leaf keyed by the line text.
    const text = ctx.read(line.from, line.to).trim();
    if (text) {
      obj[text] = {};
      options.sources?.set(obj[text] as object, newSource(line));
      source.keys.set(text, line);
      source.lines.set(text, line);
    }
  }
  const value = arr ?? obj;
  options.sources?.set(value, source);
  return { value, headers, hasArrayItems: arr != null };
}

/** Build the typed nested struct for an `animation`/`theme`/`morph` body. */
export function parseStructBodyTyped(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
  sink?: InkDiagnostic[],
  options: TypedStructBodyOptions = {},
): Record<string, unknown> {
  const entries = readStructBodyEntries(contentNode, ctx, (content) =>
    classifyLine(content, ctx),
  );
  if (entries.length === 0) {
    const empty = {};
    options.sources?.set(empty, newSource());
    return empty;
  }
  const result = evaluate(entries, ctx, sink, options);
  if (!Array.isArray(result.value)) {
    return result.value as Record<string, unknown>;
  }
  const spread = { ...result.value };
  options.sources?.set(spread, newSource());
  return spread;
}

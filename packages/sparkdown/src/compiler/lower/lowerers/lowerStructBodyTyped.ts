import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";
import { structValueNode } from "../utils/structValueNode";
import {
  readStructBodyEntries,
  type StructEntry,
} from "../utils/structBodyEntries";
import { unescapeString } from "../utils/unescapeString";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";


export interface SourceSpan {
  from: number;
  to: number;
}

export interface StructSource {
  line?: SourceSpan;
  keys: Map<string, SourceSpan>;
  values: Map<string, SourceSpan>;
  lines: Map<string, SourceSpan>;
  items: SourceSpan[];
  itemValues: (SourceSpan | null)[];
}

export interface TypedStructBodyOptions {
  literalKeys?: ReadonlySet<string>;
  literalListKeys?: ReadonlySet<string>;
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

const STRUCT_REFERENCE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

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
  const raw = ctx.read(value.from, value.to).trim();
  const ref = STRUCT_REFERENCE_RE.exec(raw);
  if (ref) return { $type: ref[1], $name: ref[2] };
  return raw;
}

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

function headerKey(entry: StructEntry, ctx: LowerContext): string {
  return entry.key ? ctx.read(entry.key.from, entry.key.to).trim() : "";
}

function headerKeyNode(entry: StructEntry): SyntaxNode {
  return entry.key ?? entry.shape;
}

const KEYFRAME_SELECTOR = nodeNameSet(["LuauKeyframeSelector"]);

function keyframeOffset(
  keyNode: SyntaxNode,
  key: string,
  ctx: LowerContext,
): number | null {
  const selector = firstDescendant(keyNode, KEYFRAME_SELECTOR);
  if (!selector || ctx.read(selector.from, selector.to) !== key) return null;
  if (key === "from") return 0;
  if (key === "to") return 1;
  return Number(key.slice(0, -1)) / 100;
}

interface HeaderEntry {
  key: string;
  node: SourceSpan;
  keyNode: SourceSpan;
  offset: number | null;
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

function keyframesFromPositionKeys(
  headers: HeaderEntry[],
  hasArrayItems: boolean,
  ctx: LowerContext,
  sink: InkDiagnostic[] | undefined,
  sources?: WeakMap<object, StructSource>,
): unknown[] | null {
  if (headers.length === 0) return null;
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
    frames.push({ offset, frame: { ...props, offset }, header: h });
  }

  frames.sort((a, b) => a.offset - b.offset);
  const result = frames.map((f) => f.frame);
  if (sources) {
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
      arr = arr ?? [];
      if (entry.children) {
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
      const key = headerKey(entry, ctx);
      const keyNode = headerKeyNode(entry);
      if (entry.children) {
        const sub = evaluate(entry.children, ctx, sink, options, key, line);
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

export function parseStructBodyTyped(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
  sink?: InkDiagnostic[],
  options: TypedStructBodyOptions = {},
): Record<string, unknown> {
  const entries = readStructBodyEntries(contentNode, ctx);
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

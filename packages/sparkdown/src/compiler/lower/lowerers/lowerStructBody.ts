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

const KEY_TOKEN_NAMES: ReadonlySet<string> = nodeNameSet([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "PropertyName",
]);

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

function attributeRanges(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, ATTRIBUTE_NAMES, true);
}

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

function classDots(node: SyntaxNode): TextEdit[] {
  return nodesOutsideAttributes(node, CLASS_DOT_NAMES).map((r) => ({
    ...r,
    separator: true,
  }));
}

const CLASS_DOT_NAMES: ReadonlySet<string> = nodeNameSet(["LuauSparkleClassDot"]);

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

interface TextEdit {
  from: number;
  to: number;
  text?: string;
  separator?: boolean;
}

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
  elementKeys?: boolean;
}

export function parseStructBody(
  entries: StructEntry[],
  ctx: LowerContext,
  options: StructBodyOptions = {},
): Record<string, unknown> {
  const result = evaluate(entries, ctx, !!options.elementKeys);
  return Array.isArray(result) ? { ...result } : result;
}

const COMMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauLineComment",
  "LuauBlockComment",
  "LuauDocLineComment",
  "LuauStructBlockSlashComment",
]);

interface ElementSegment {
  node: SyntaxNode;
  to: number;
  edits: TextEdit[];
  value: SyntaxNode | null;
}

const CLOSURE_ATTRIBUTE = "LuauSparkleEventClosureAttribute";

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
      ?
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
      const key = entry.key
        ? textWithoutAttributes(entry.key, ctx).trim()
        : "";
      obj[key] = entry.children
        ? evaluate(entry.children, ctx, elementKeys)
        : {};
    } else if (entry.kind === "property") {
      const keyNode = firstDescendant(shape, KEY_TOKEN_NAMES);
      const valueNode = firstDescendant(shape, FIELD_VALUE_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (key) obj[key] = parseScalar(valueNode ? readValue(valueNode, ctx) : "");
    }
  }
  return arr ?? obj;
}

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

function readValue(value: SyntaxNode, ctx: LowerContext): string {
  const node = structValueNode(value);
  return ctx.read(node.from, node.to).trim();
}

const STRUCT_REFERENCE_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

function parseScalar(raw: string): unknown {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return unescapeString(s.slice(1, -1));
  }
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

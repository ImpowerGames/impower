import { type SyntaxNode } from "@lezer/common";
import { LowerContext } from "../context";
import {
  type BodyNode,
  type ContentPart,
  type ElementNode,
  type PropValue,
} from "../../types/SparkleNode";

// Builds the reactive Sparkle UI AST (docs/sparkle/reactive-sparkle-spec.md §6)
// for a screen/component body. Unlike the static `lowerStructBody` (which
// re-tokenizes the raw line text to build the engine's nested struct), this
// reads the structured child nodes the highlighting grammar ALREADY emits
// inside each `LuauStructBodyContent` line — the tag/class/key/value tokens are
// already separated, so we never re-parse text here. (See
// feedback_ast_lowerer_reads_grammar_tokens.)
//
//   LuauStructObjectHeader  → `stage:` / `choice 0:` → container element
//                             (first ComponentName = tag; trailing
//                             ComponentName/NumberLiteral parts = classes)
//   LuauStructBareMarker    → `image` / `mask shadow_1` → leaf element
//                             (first ComponentName = tag; rest = classes)
//   LuauStructScalarProperty→ `image = "black"` (builtin key) → element whose
//                             content is the value; a non-builtin key
//                             (`color = white`) → a style prop on the parent.
//
// Nesting is reconstructed from the indentation column (the grammar emits flat
// body-line siblings), mirroring lowerStructBody's `parseBlock`.

interface NodeLine {
  indent: number;
  /** The `LuauStructBodyContent` node for this body line. */
  node: SyntaxNode;
}

/** Collect each body line's `LuauStructBodyContent` node + its indent column. */
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
        // Skip whole-line `--` Luau comments (same rule as lowerStructBody).
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

/** The line-type node inside a `LuauStructBodyContent` (scalar/header/marker).
 *  The grammar wraps it under `_c*` capture nodes; the first NAMED line-kind
 *  descendant is what we want. */
function lineKindNode(content: SyntaxNode): SyntaxNode | null {
  return firstDescendant(content, LINE_KIND_NAMES);
}

const LINE_KIND_NAMES = new Set([
  "LuauStructScalarProperty",
  "LuauStructObjectHeader",
  "LuauStructBareMarker",
  "LuauStructArrayItem",
  "LuauStructBodyFallback",
]);

const NAME_TOKEN_NAMES = new Set([
  "BuiltinComponentName",
  "CustomComponentName",
  "NumberLiteral",
]);

const KEY_TOKEN_NAMES = new Set([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
]);

const FIELD_VALUE_NAMES = new Set([
  "StringFieldValue",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

/** DFS in-order: the first descendant (or self) whose name is in `names`. */
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

/** DFS in-order: every descendant whose name is in `names`, source order, but
 *  WITHOUT descending into a matched node (so a value subtree's inner tokens
 *  don't leak when collecting top-level name tokens). */
function descendants(node: SyntaxNode, names: Set<string>): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (names.has(c.name)) {
        out.push(c);
      } else {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return out;
}

/** Tag + classes from an object-header/bare-marker node: first component name
 *  is the tag, trailing component names / bare numbers are classes
 *  (`choice 0` → tag "choice" + ["0"]; `mask shadow_1` → "mask" + ["shadow_1"]). */
function tagAndClasses(
  node: SyntaxNode,
  ctx: LowerContext,
): { tag: string | null; classes: string[] } {
  const tokens = descendants(node, NAME_TOKEN_NAMES);
  if (tokens.length === 0) return { tag: null, classes: [] };
  const tag = ctx.read(tokens[0]!.from, tokens[0]!.to).trim();
  const classes = tokens
    .slice(1)
    .map((t) => ctx.read(t.from, t.to).trim())
    .filter(Boolean);
  return { tag, classes };
}

/** Read a field-value node as a literal PropValue. Interpolation (`{expr}`)
 *  and `{expr}` bindings are added in a later increment; for now every value
 *  is a literal (current screen/component bodies carry no interpolation). */
const PLAIN_STRING_CONTENT = new Set(["PlainStringContent"]);

function readLiteralValue(value: SyntaxNode | null, ctx: LowerContext): PropValue {
  if (!value) return { kind: "literal", value: "" };
  if (value.name === "StringFieldValue") {
    // Read the unquoted inner content (PlainStringContent), else strip quotes.
    const inner = firstDescendant(value, PLAIN_STRING_CONTENT);
    if (inner) {
      return { kind: "literal", value: ctx.read(inner.from, inner.to) };
    }
    const raw = ctx.read(value.from, value.to).trim();
    return { kind: "literal", value: raw.replace(/^"|"$/g, "") };
  }
  if (value.name === "NumericFieldValue") {
    const n = Number(ctx.read(value.from, value.to).trim());
    return { kind: "literal", value: Number.isNaN(n) ? 0 : n };
  }
  if (value.name === "BooleanFieldValue") {
    return { kind: "literal", value: ctx.read(value.from, value.to).trim() === "true" };
  }
  return { kind: "literal", value: ctx.read(value.from, value.to).trim() };
}

/** Indent of line i's first child line, or null if i has no deeper-indented
 *  follower (leaf). Mirrors lowerStructBody.nextChildIndent. */
function nextChildIndent(
  lines: NodeLine[],
  i: number,
  indent: number,
): number | null {
  const next = lines[i + 1];
  if (next && next.indent > indent) return next.indent;
  return null;
}

interface Block {
  children: BodyNode[];
  /** Style props from non-builtin `key = value` lines at this level. */
  props: Record<string, PropValue>;
  next: number;
}

function buildBlock(
  lines: NodeLine[],
  start: number,
  indent: number,
  ctx: LowerContext,
): Block {
  const children: BodyNode[] = [];
  const props: Record<string, PropValue> = {};
  let i = start;
  while (i < lines.length && lines[i]!.indent >= indent) {
    if (lines[i]!.indent > indent) {
      i += 1; // defensive: over-indented orphan
      continue;
    }
    const content = lines[i]!.node;
    const kind = lineKindNode(content);
    const childIndent = nextChildIndent(lines, i, indent);
    if (!kind) {
      i += 1;
      continue;
    }

    if (kind.name === "LuauStructScalarProperty") {
      const keyNode = firstDescendant(kind, KEY_TOKEN_NAMES);
      const value = readLiteralValue(firstDescendant(kind, FIELD_VALUE_NAMES), ctx);
      if (keyNode?.name === "BuiltinComponentName") {
        // `image = "black"` → an element whose content is the value.
        const tag = ctx.read(keyNode.from, keyNode.to).trim();
        const content: ContentPart[] =
          value.kind === "literal"
            ? [{ kind: "literal", text: String(value.value) }]
            : [{ kind: "binding", binding: value.binding }];
        const element: ElementNode = {
          kind: "element",
          tag,
          classes: [],
          content,
          props: {},
          events: [],
          children: [],
        };
        i = attachBlock(element, lines, i, childIndent, ctx);
        children.push(element);
      } else {
        // Non-builtin `key = value` → a style prop on the enclosing element.
        const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
        if (key) props[key] = value;
        i += 1;
      }
      continue;
    }

    // Object header (`stage:`) or bare marker (`image` / `mask shadow_1`) →
    // an element; tag = first component name, classes = trailing parts.
    const { tag: parsedTag, classes } = tagAndClasses(kind, ctx);
    const tag = parsedTag ?? ctx.read(content.from, content.to).trim();
    const element: ElementNode = {
      kind: "element",
      tag,
      classes,
      props: {},
      events: [],
      children: [],
    };
    i = attachBlock(element, lines, i, childIndent, ctx);
    children.push(element);
  }
  return { children, props, next: i };
}

/** If line i has an indented child block, recurse and assign the block's
 *  children + props onto `element`; return the next line index. */
function attachBlock(
  element: ElementNode,
  lines: NodeLine[],
  i: number,
  childIndent: number | null,
  ctx: LowerContext,
): number {
  if (childIndent == null) return i + 1;
  const sub = buildBlock(lines, i + 1, childIndent, ctx);
  element.children = sub.children;
  if (Object.keys(sub.props).length > 0) element.props = sub.props;
  return sub.next;
}

/** Build the reactive AST body (BodyNode[]) for a screen/component content
 *  node, reading the grammar's separated tokens. */
export function buildSparkleBody(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): BodyNode[] {
  const lines = collectNodeLines(contentNode, ctx);
  if (lines.length === 0) return [];
  return buildBlock(lines, 0, lines[0]!.indent, ctx).children;
}

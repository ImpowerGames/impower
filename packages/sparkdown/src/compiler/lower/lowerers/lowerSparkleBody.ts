import { type SyntaxNode } from "@lezer/common";
import { LowerContext } from "../context";
import { ErrorType } from "../../../inkjs/engine/Error";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import {
  type Binding,
  type BodyNode,
  type ContentPart,
  type ElementNode,
  type EventBinding,
  type PropValue,
} from "../../types/SparkleNode";
import { type SparkRange } from "../../types/SparkRange";

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
  "LuauStructAdjacencyContent",
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
  "StringFieldValueInterpolated",
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

/** Inline-attribute subtrees (`@event`/`#prop`) — opaque to tag/class
 *  collection, so a prop value (`#gap=16` → NumberLiteral) isn't mistaken for a
 *  class and a handler's tokens don't leak in. */
const ATTRIBUTE_NODES = new Set(["LuauEventAttribute", "LuauPropAttribute"]);

/** DFS in-order: every descendant whose name is in `names`, source order, but
 *  WITHOUT descending into a matched node (so a value subtree's inner tokens
 *  don't leak when collecting top-level name tokens) and WITHOUT descending
 *  into inline-attribute subtrees. */
function descendants(node: SyntaxNode, names: Set<string>): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (names.has(c.name)) {
        out.push(c);
      } else if (!ATTRIBUTE_NODES.has(c.name)) {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return out;
}

/** Tag + classes from an object-header/bare-marker node. Per the sparkle rule:
 *  the BUILTIN/component token is the tag (position-independent — `mask shadow_1`
 *  and `shadow_1 mask` both → tag "mask"); every OTHER bare word (and bare
 *  number) is a class. A line with more than one builtin tag is ambiguous, so a
 *  warning is emitted (the first builtin is kept as the tag). With no builtin,
 *  the first token is taken as the (component) tag. */
function tagAndClasses(
  node: SyntaxNode,
  ctx: LowerContext,
): { tag: string | null; classes: string[] } {
  const tokens = descendants(node, NAME_TOKEN_NAMES);
  if (tokens.length === 0) return { tag: null, classes: [] };
  const builtins = tokens.filter((t) => t.name === "BuiltinComponentName");
  const tagNode = builtins[0] ?? tokens[0]!;
  if (builtins.length > 1) warnMultipleTags(builtins, ctx);
  const tag = ctx.read(tagNode.from, tagNode.to).trim();
  const classes = tokens
    .filter((t) => t !== tagNode)
    .map((t) => ctx.read(t.from, t.to).trim())
    .filter(Boolean);
  return { tag, classes };
}

/** Warn (editor-side) when an element line names more than one builtin tag —
 *  ambiguous which is the element. No-op for snapshot callers without a
 *  diagnostics buffer. */
function warnMultipleTags(builtins: SyntaxNode[], ctx: LowerContext): void {
  if (!ctx.diagnostics) return;
  const names = builtins.map((b) => ctx.read(b.from, b.to).trim());
  for (const extra of builtins.slice(1)) {
    ctx.diagnostics.push({
      message: `An element can only have one tag, but found multiple: ${names.join(
        ", ",
      )}. Only the first is used as the tag — did you mean a class?`,
      severity: ErrorType.Warning,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(extra.from) + 1,
        endLineNumber: ctx.lineNumber(extra.to) + 1,
        startCharacterNumber: ctx.characterNumber(extra.from) + 1,
        endCharacterNumber: ctx.characterNumber(extra.to) + 1,
      },
    });
  }
}

/** Collapse the content-string brace escapes (spec D3): `{{` → `{`, `}}` → `}`.
 *  Only applied to display CONTENT (not Luau-position prop/style values). */
function collapseBraceEscapes(text: string): string {
  return text.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
}

/** Compile a `{expr}` interpolation node (a `LuauInterpolatedStringExpression`)
 *  into a {@link Binding}: a synthetic nullary function
 *  `__binding_<from>() return <expr> end` hoisted into `ctx.hoistedKnots`, plus
 *  the handle the AST carries. The reactive runtime (Phase 3) calls the hoisted
 *  function to evaluate the binding (and, later, track its reads for deps); the
 *  compiler only produces the handle + the function. Bindings read game-state
 *  globals by name, so the function is nullary — no upvalue capture (one-way
 *  binding, spec L6). The name is keyed on the source byte offset so it stays
 *  unique across chunks and stable across edits (mirrors `__anon_fn_<from>`). */
function lowerBinding(interpNode: SyntaxNode, ctx: LowerContext): Binding {
  const exprId = `__binding_${interpNode.from}`;
  const source = ctx.read(interpNode.from, interpNode.to);
  const span: SparkRange = {
    file: ctx.filePath,
    line: ctx.lineNumber(interpNode.from),
    from: interpNode.from,
    to: interpNode.to,
  };
  // Hoist the evaluator once per source position (the same expression node can
  // be lowered more than once; first registration wins). Snapshot-only callers
  // without a hoist buffer skip it — the handle is still produced.
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    // The expression lives in the `_content` child; passing the wrapper node
    // works — `lowerExpressionFromContainer` skips the brace punctuation (same
    // call shape as `lowerInterpolatedString`).
    const expr = lowerExpressionFromContainer(interpNode, ctx);
    const fn = new Function(
      new Identifier(exprId),
      [new ReturnType(expr ?? null)],
      [],
    );
    ctx.hoistedKnots.push(fn);
  }
  return { exprId, source, span };
}

const EVENT_ATTR = new Set(["LuauEventAttribute"]);
const EVENT_NAME = new Set(["EventAttributeName"]);
const EVENT_CONTENT = new Set(["LuauEventAttribute_content"]);
const BARE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** DFS: every `LuauEventAttribute` descendant, in source order. */
function eventAttributes(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (EVENT_ATTR.has(c.name)) out.push(c);
      else walk(c);
      c = c.nextSibling;
    }
  };
  walk(node);
  return out;
}

/** Build EventBindings (spec §4.5) from a line's `@event=handler` attributes.
 *  `@e=name` → a `ref` (the runtime calls the named function); `@e=call(args)`
 *  → a `call` whose binding (`__binding_N`) the runtime invokes. Inline closures
 *  `@e={ … }` are a later increment. */
function readEvents(lineNode: SyntaxNode, ctx: LowerContext): EventBinding[] {
  const events: EventBinding[] = [];
  for (const attr of eventAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, EVENT_NAME);
    const event = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!event) continue;
    const handlerNode = firstDescendant(attr, EVENT_CONTENT);
    const handlerText = handlerNode
      ? ctx.read(handlerNode.from, handlerNode.to).trim()
      : "";
    if (handlerNode && BARE_NAME_RE.test(handlerText)) {
      events.push({ event, handler: { kind: "ref", name: handlerText } });
    } else if (handlerNode) {
      events.push({
        event,
        handler: { kind: "call", binding: lowerBinding(handlerNode, ctx) },
      });
    }
  }
  return events;
}

const PROP_ATTR = new Set(["LuauPropAttribute"]);
const PROP_NAME = new Set(["StyleAttributeName"]);
const PROP_INTERP = new Set(["LuauInterpolatedStringExpression"]);
const PROP_QUOTED = new Set(["InlinePropQuotedValue"]);
const PROP_LITERAL = new Set(["InlinePropLiteralValue"]);

/** DFS: every `LuauPropAttribute` descendant, in source order. */
function propAttributes(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const walk = (n: SyntaxNode) => {
    let c = n.firstChild;
    while (c) {
      if (PROP_ATTR.has(c.name)) out.push(c);
      else walk(c);
      c = c.nextSibling;
    }
  };
  walk(node);
  return out;
}

/** Parse an unquoted inline prop literal (`16`, `0.5`, `auto`, `#fff`, `true`):
 *  numbers → number, `true`/`false` → boolean, everything else → string. */
function parsePropLiteral(text: string): string | number | boolean {
  const s = text.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Build the inline `#prop=value` map (spec §4.2/§4.4) from a line's prop
 *  attributes. `{expr}` → a reactive binding; `"string"`/literal → a literal
 *  PropValue. The reactive runtime re-applies bound props on dep change. */
function readProps(
  lineNode: SyntaxNode,
  ctx: LowerContext,
): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  for (const attr of propAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, PROP_NAME);
    const name = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!name) continue;
    const interp = firstDescendant(attr, PROP_INTERP);
    if (interp) {
      props[name] = { kind: "binding", binding: lowerBinding(interp, ctx) };
      continue;
    }
    const quoted = firstDescendant(attr, PROP_QUOTED);
    if (quoted) {
      const raw = ctx.read(quoted.from, quoted.to);
      props[name] = { kind: "literal", value: raw.replace(/^"|"$/g, "") };
      continue;
    }
    const literal = firstDescendant(attr, PROP_LITERAL);
    if (literal) {
      props[name] = {
        kind: "literal",
        value: parsePropLiteral(ctx.read(literal.from, literal.to)),
      };
    }
  }
  return props;
}

/** Build the ordered literal/binding content parts for an element's display
 *  content. Handles the interpolation-aware `StringFieldValueInterpolated`
 *  (literal runs + `{expr}` bindings) and plain values (a single literal part),
 *  collapsing `{{`/`}}` brace escapes in literal text. */
function readContentParts(
  value: SyntaxNode | null,
  ctx: LowerContext,
): ContentPart[] {
  if (value?.name === "StringFieldValueInterpolated") {
    const inner = firstDescendant(value, INTERP_CONTENT_WRAPPER);
    const parts: ContentPart[] = [];
    let textBuf = "";
    const flush = () => {
      if (textBuf.length > 0) {
        parts.push({ kind: "literal", text: collapseBraceEscapes(textBuf) });
        textBuf = "";
      }
    };
    let child = inner?.firstChild ?? null;
    while (child) {
      if (child.name === "LuauInterpolatedStringExpression") {
        flush();
        parts.push({ kind: "binding", binding: lowerBinding(child, ctx) });
      } else {
        textBuf += ctx.read(child.from, child.to);
      }
      child = child.nextSibling;
    }
    flush();
    return parts.length > 0 ? parts : [{ kind: "literal", text: "" }];
  }
  // Plain value → a single literal content part (collapse brace escapes for
  // strings; numbers/bools stringify).
  const literal = readLiteralValue(value, ctx);
  if (literal.kind === "literal") {
    const text =
      typeof literal.value === "string"
        ? collapseBraceEscapes(literal.value)
        : String(literal.value);
    return [{ kind: "literal", text }];
  }
  return [{ kind: "binding", binding: literal.binding }];
}

const INTERP_CONTENT_WRAPPER = new Set(["StringFieldValueInterpolated_content"]);

/** Read a field-value node as a literal PropValue, used for inline props/style
 *  values (Luau-position values that are NOT reactive in v1). Display content
 *  goes through {@link readContentParts} instead. */
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

    if (kind.name === "LuauStructAdjacencyContent") {
      // `image "black"` / `text "HP: {hp}"` — tag + adjacency display content
      // (literal + `{expr}` reactive bindings). Spec §4.2/D2.
      const tagNode = firstDescendant(kind, NAME_TOKEN_NAMES);
      const tag = tagNode ? ctx.read(tagNode.from, tagNode.to).trim() : "";
      const content = readContentParts(
        firstDescendant(kind, FIELD_VALUE_NAMES),
        ctx,
      );
      const element: ElementNode = {
        kind: "element",
        tag,
        classes: [],
        content,
        props: readProps(kind, ctx),
        events: readEvents(kind, ctx),
        children: [],
      };
      i = attachBlock(element, lines, i, childIndent, ctx);
      children.push(element);
      continue;
    }

    if (kind.name === "LuauStructScalarProperty") {
      const keyNode = firstDescendant(kind, KEY_TOKEN_NAMES);
      const valueNode = firstDescendant(kind, FIELD_VALUE_NAMES);
      if (keyNode?.name === "BuiltinComponentName") {
        // `image = "black"` / `text = "HP: {hp}"` → an element whose display
        // content is the value (literal + `{expr}` reactive bindings).
        const tag = ctx.read(keyNode.from, keyNode.to).trim();
        const content: ContentPart[] = readContentParts(valueNode, ctx);
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
        // Props are Luau-position values (static in v1), so they read as a
        // literal — interpolation applies to display content only.
        const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
        if (key) props[key] = readLiteralValue(valueNode, ctx);
        i += 1;
      }
      continue;
    }

    // Object header (`stage:` / `column #gap=16:`) or bare marker (`image` /
    // `mask shadow_1` / `text title "Inventory"` / `row #background-color={c}`)
    // → an element; the builtin/component token is the tag, other bare words are
    // classes, plus optional adjacency content + inline props/events.
    const { tag: parsedTag, classes } = tagAndClasses(kind, ctx);
    const tag = parsedTag ?? ctx.read(content.from, content.to).trim();
    const contentNode = firstDescendant(kind, FIELD_VALUE_NAMES);
    const element: ElementNode = {
      kind: "element",
      tag,
      classes,
      ...(contentNode ? { content: readContentParts(contentNode, ctx) } : {}),
      props: readProps(kind, ctx),
      events: readEvents(kind, ctx),
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
  // Merge child-level `key = value` style props onto any inline `#prop`s already
  // on the element line (inline props first, child-level props win on conflict).
  if (Object.keys(sub.props).length > 0) {
    element.props = { ...element.props, ...sub.props };
  }
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

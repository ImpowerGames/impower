import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { ErrorType } from "../../../inkjs/engine/Error";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import {
  type Binding,
  type BodyNode,
  type ContentPart,
  type ElementNode,
  type EventBinding,
  type FillNode,
  type ForNode,
  type IfNode,
  type MatchNode,
  type PropValue,
  type SlotNode,
} from "../../types/SparkleNode";
import { type SparkRange } from "../../types/SparkRange";
import { stampDebugMetadata } from "../utils/debugMetadata";
import { unescapeString } from "../utils/unescapeString";
import {
  UNQUOTED_VALUE_NODES,
  stripTrailingLineComment,
} from "../utils/stripTrailingLineComment";

// Builds the reactive Sparkle UI AST (docs/sparkle/reactive-sparkle-spec.md §6)
// for a screen/component body. Unlike the static `lowerStructBody` (which
// re-tokenizes the raw line text to build the engine's nested struct), this
// reads the structured child nodes the highlighting grammar ALREADY emits
// inside each `LuauStructBodyContent` line — the tag/class/key/value tokens are
// already separated, so we never re-parse text here. (See
// feedback_ast_lowerer_reads_grammar_tokens.)
//
//   LuauStructObjectHeader  → `stage:` / `choice 0:` → container element
//                             (first name = tag; the rest are classes)
//   LuauStructBareMarker    → `image` / `mask shadow_1` → leaf element
//                             (first name = tag; the rest are classes)
//   LuauStructScalarProperty→ `image = "black"` (builtin key) → element whose
//                             content is the value; a non-builtin key
//                             (`color = white`) → a style prop on the parent.
//
// Nesting is reconstructed from the indentation column (the grammar emits flat
// body-line siblings), mirroring lowerStructBody's `parseBlock`.

interface NodeLine {
  indent: number;
  /** A `LuauStructBodyContent` element line, or a `LuauSparkleIfBlock` control
   *  block (when `control` is set). */
  node: SyntaxNode;
  control?: boolean;
}

const CONTROL_BLOCK_NAMES = new Set([
  "LuauSparkleIfBlock",
  "LuauSparkleForLoop",
  "LuauSparkleMatchBlock",
]);
// Clause sub-blocks of a control block — collected explicitly by the control
// builder, so the generic item walk must NOT descend into or emit them.
const CONTROL_CLAUSE_NAMES = new Set([
  "LuauSparkleElseifBlock",
  "LuauSparkleElseBlock",
  "LuauSparkleCaseClause",
]);

/** Collect a body's items (element lines + control blocks) with their indent
 *  column, in source order. Element nesting is later reconstructed from indent
 *  (`buildBlock`); control blocks carry their own grammar structure, so they're
 *  emitted opaque (not descended into) and built recursively by `buildControl`. */
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
        // A line the grammar classified into no SHAPE is a comment (or blank),
        // and a comment occupies no indent slot. Asking the grammar rather than
        // re-reading the text is what makes this uniform: the old string test
        // knew about `--` and not `//`, so a `//` comment aligned with the
        // block HEADER — or indented deeper than the block's children — was
        // taken as a body line and silently deleted the block's children (one
        // child, or none at all). `--` in the same positions was fine.
        //
        // `//` is a first-class marker here: the grammar emits
        // `SparkdownLineComment` for it, and `pico-showcase.sd` has 90 of them.
        // They all happen to align with the line below, which is the only
        // reason nothing shipped broken.
        if (lineKindNode(child)) {
          lines.push({ indent: ctx.characterNumber(child.from), node: child });
        }
      } else if (CONTROL_BLOCK_NAMES.has(child.name)) {
        // The block's `.from` is the line start (its `begin` captures the
        // leading indent), so derive the indent from the first non-whitespace
        // column (the `if`/`for`/… keyword) for correct tree placement.
        const text = ctx.read(child.from, child.to);
        const lead = text.length - text.replace(/^[ \t]*/, "").length;
        lines.push({
          indent: ctx.characterNumber(child.from + lead),
          node: child,
          control: true,
        });
      } else if (CONTROL_CLAUSE_NAMES.has(child.name)) {
        // Belongs to the enclosing control block — handled by buildControl.
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
  "LuauStructComponentCall",
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

/** Content on a block-opening element line, which the grammar parses as an
 *  object header rather than adjacency content. */
const ELEMENT_HEADER_CONTENT_NAMES = new Set(["StringContent"]);

const FIELD_VALUE_NAMES = new Set([
  "StringFieldValueInterpolated",
  "StringFieldValue",
  "LuauElementContentStringInterpolated",
  "LuauElementContentStringPlain",
  "LuauElementContentStringSingleQuoted",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// Interpolation-aware content-string nodes (EOPL-bound + inline EOPL-less). Each
// wraps its parts under a `<name>_content` child the reader walks.
const INTERP_CONTENT_NODES = new Set([
  "StringFieldValueInterpolated",
  "LuauElementContentStringInterpolated",
]);
// Plain (non-interpolated) quoted content-string nodes — read as a literal.
const PLAIN_CONTENT_NODES = new Set([
  "StringFieldValue",
  "LuauElementContentStringPlain",
  // Single-quoted content never interpolates, so it is always read literally —
  // which is exactly why an author reaches for it (e.g. text containing `{`).
  "LuauElementContentStringSingleQuoted",
]);

/** A short, stable, identifier-safe tag for the document being lowered.
 *
 *  Binding evaluator names were minted from the node's byte offset ALONE, but
 *  every hoisted evaluator lands in one flow namespace. Two files whose first
 *  binding starts at the same offset — near-inevitable for a copy-and-adapt
 *  pair of layout files — both minted `__binding_37`, producing a severity-1
 *  "Duplicate identifier" attributed to `main.sd` rather than to either file
 *  that caused it, one surviving evaluator, and both layouts resolving to it
 *  (so one rendered the other's value).
 *
 *  FNV-1a over the path: no crypto dependency, stable across runs (unlike a
 *  counter, which would change every id whenever an unrelated file was added
 *  and defeat the "first registration wins" reuse below). */
function documentTag(filePath: string | undefined | null): string {
  if (!filePath) {
    return "";
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < filePath.length; i += 1) {
    hash ^= filePath.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}_`;
}

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

/** {@link firstDescendant}, but opaque to inline-attribute subtrees.
 *
 *  Use this for anything that asks "what did the author write on the LINE",
 *  because a prop value is a field value of exactly the kind those lookups
 *  match. Without the guard, `text #label="HP: {c}"` found the PROP's
 *  interpolated string as the element's own content — and, being first in
 *  document order, it beat the content the author actually wrote, which then
 *  appeared in neither the AST nor the DOM. */
function firstContentDescendant(
  node: SyntaxNode,
  names: Set<string>,
): SyntaxNode | null {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    if (!ATTRIBUTE_NODES.has(c.name)) {
      const found = firstContentDescendant(c, names);
      if (found) return found;
    }
    c = c.nextSibling;
  }
  return null;
}

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

/** Tag + classes from an object-header/bare-marker node. The FIRST name on the
 *  line is the tag; every other bare word (and bare number) is a class.
 *
 *  Position, not builtin-ness, decides — which is what the engine does
 *  ("the tag lookup reads the FIRST token only") and what the bare-marker
 *  grammar already enforced by tokenizing only the leading name as a
 *  `BuiltinComponentName`. A colon HEADER does not split that way: every word
 *  is re-tokenized, so a trailing builtin also came out as a
 *  `BuiltinComponentName` and a builtin-first rule picked IT. Adding children
 *  to an element therefore changed the element:
 *
 *      card footer      ->  <div class="card footer">
 *      card footer:     ->  <footer class="footer card">
 *
 *  and `list item:` warned about multiple tags where `list item` did not. The
 *  two spellings now agree, in both directions. */
function tagAndClasses(
  node: SyntaxNode,
  ctx: LowerContext,
): { tag: string | null; classes: string[] } {
  const tokens = descendants(node, NAME_TOKEN_NAMES);
  if (tokens.length === 0) return { tag: null, classes: [] };
  const tagNode = tokens[0]!;
  const tag = ctx.read(tagNode.from, tagNode.to).trim();
  const classes = tokens
    .slice(1)
    .map((t) => ctx.read(t.from, t.to).trim())
    .filter(Boolean);
  return { tag, classes };
}

/** Warn (editor-side) when a line's indentation matches no open block, so it is
 *  about to be dropped. No-op for snapshot callers without a diagnostics
 *  buffer, so snapshot tests are unaffected. */
function warnOrphanLine(node: SyntaxNode, ctx: LowerContext): void {
  if (!ctx.diagnostics) return;
  ctx.diagnostics.push({
    message:
      "This line's indentation doesn't match any element above it, so it isn't part of the layout. Line it up with the block you meant to nest it under.",
    severity: ErrorType.Warning,
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

// Display CONTENT resolves the FULL escape set — see {@link unescapeString}.
// It used to resolve `\{`/`\}` alone, which was the tell: escapes already
// half-existed here, and the grammar paints `\"` as `constant.character.escape`,
// so the editor showed an escape while the compiler printed the backslash on
// screen (`text "say \"hi\""` → `say \"hi\"`).
//
// (`{{`/`}}` are not escapes: doubled braces are the `{{fn}}` call shorthand per
// issue #223, superseding spec decision D3.) Luau-position prop/style values are
// left alone.

/** Compile a `{expr}` interpolation node (a `LuauInterpolatedStringExpression`)
 *  into a {@link Binding}: a synthetic nullary function
 *  `__binding_<from>() return <expr> end` hoisted into `ctx.hoistedKnots`, plus
 *  the handle the AST carries. The reactive runtime (Phase 3) calls the hoisted
 *  function to evaluate the binding (and, later, track its reads for deps); the
 *  compiler only produces the handle + the function. Bindings read game-state
 *  globals by name, so the function is nullary — no upvalue capture (one-way
 *  binding, spec L6). The name is keyed on the source byte offset so it stays
 *  unique across chunks and stable across edits (mirrors `__anon_fn_<from>`). */
function lowerBinding(
  interpNode: SyntaxNode,
  ctx: LowerContext,
  extraParams: string[] = [],
): Binding {
  const exprId = `__binding_${documentTag(ctx.filePath)}${interpNode.from}`;
  const source = ctx.read(interpNode.from, interpNode.to);
  const span: SparkRange = {
    file: ctx.filePath,
    line: ctx.lineNumber(interpNode.from),
    from: interpNode.from,
    to: interpNode.to,
  };
  // Enclosing `for`-loop variables become the evaluator's parameters so the
  // body can read per-iteration values the runtime passes as args (loop locals
  // aren't globals — see LowerContext.sparkleLoopVars). `extraParams` adds
  // handler-only params like `event` (the runtime supplies the DOM event table).
  // DEDUPED: nested loops may bind the SAME name (`for i in rows` inside
  // `for i in cols`), and a component param can be re-bound by a loop
  // (`component card(item)` + `for item in ...`). The stack is push/restore, so
  // both live on it at once; handing both to the evaluator produced
  // `params: ["i","i"]` and a severity-1 "Multiple arguments with the same
  // name" on every keystroke — anchored at the interpolation, not the loop
  // header, for a construct that is legal Luau in this same language. The
  // rendered values were always right (the runtime maps params against a flat
  // env, so both copies resolved to the innermost value); only the Problems
  // panel was wrong. Deduped HERE rather than at the push site, which has to
  // stay a plain stack for `buildForNode`'s `length = restoreLen` restore.
  const loopVars = [...new Set([...(ctx.sparkleLoopVars ?? []), ...extraParams])];
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
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    // Stamp the hoisted evaluator with the binding's source span so a compile
    // error inside it (e.g. an undefined `{player.inventory}`) reports at the
    // binding, not at line 0 (a Function with no debugMetadata makes the
    // inner-node error walk hit null → 0:0). remapContent later rebases it.
    stampDebugMetadata([fn], interpNode.from, interpNode.to, ctx, true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    exprId,
    source,
    span,
    ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
  };
}

const COMPONENT_CALL_CONTENT = new Set(["LuauStructComponentCall_content"]);
/** Nodes inside a call's arg list that carry no expression value (separators,
 *  whitespace, comments) — skipped when grouping args. */
const ARG_SKIP_RE = /Whitespace|Newline|Comment|Separator/;

/** Build a component-call's positional args (`card(a, b)`) as `PropValue[]`.
 *  Splits the call's arg expressions on `LuauCommaSeparator` (mirrors
 *  `lowerParentheticalArgList`) and compiles each group into a reactive
 *  {@link Binding} — args are evaluated in the CALLER's scope (so they capture
 *  the caller's loop vars), and the runtime feeds each value to the component as
 *  the matching declared param. */
function readComponentArgs(callNode: SyntaxNode, ctx: LowerContext): PropValue[] {
  const content = firstDescendant(callNode, COMPONENT_CALL_CONTENT);
  if (!content) return [];
  const args: PropValue[] = [];
  let group: SyntaxNode[] = [];
  const flush = () => {
    if (group.length > 0) {
      args.push(lowerComponentArg(group, ctx));
      group = [];
    }
  };
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauCommaSeparator") {
      flush();
    } else if (!ARG_SKIP_RE.test(child.name)) {
      group.push(child);
    }
    child = child.nextSibling;
  }
  flush();
  return args;
}

/** Compile one component-call arg (a list of expression nodes for a single
 *  positional argument) into a reactive {@link Binding} PropValue, mirroring
 *  {@link lowerBinding} but reading already-split nodes via
 *  `lowerExpressionFromNodes`. Enclosing `for`-loop vars (caller scope) become
 *  the evaluator's params. */
function lowerComponentArg(
  argNodes: SyntaxNode[],
  ctx: LowerContext,
): PropValue {
  // A lone quoted string with `{expr}` interpolates like display content
  // (spec D3: "quoted = text, braces = code"): lower it to a `content` PropValue
  // (literal + binding parts) the runtime concatenates to a string. Bindings
  // capture the caller's loop vars (readContentParts → lowerBinding), matching
  // how a bare-expression arg is evaluated in the caller scope.
  if (
    argNodes.length === 1 &&
    (INTERP_CONTENT_NODES.has(argNodes[0]!.name) ||
      PLAIN_CONTENT_NODES.has(argNodes[0]!.name))
  ) {
    return { kind: "content", content: readContentParts(argNodes[0]!, ctx) };
  }
  const first = argNodes[0]!;
  const last = argNodes[argNodes.length - 1]!;
  const exprId = `__binding_${documentTag(ctx.filePath)}${first.from}`;
  const source = ctx.read(first.from, last.to);
  const span: SparkRange = {
    file: ctx.filePath,
    line: ctx.lineNumber(first.from),
    from: first.from,
    to: last.to,
  };
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])]; // see lowerBinding
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const expr = lowerExpressionFromNodes(argNodes, ctx);
    const fn = new Function(
      new Identifier(exprId),
      [new ReturnType(expr ?? null)],
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], first.from, last.to, ctx, true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    kind: "binding",
    binding: {
      exprId,
      source,
      span,
      ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
    },
  };
}

const EVENT_ATTR = new Set(["LuauEventAttribute"]);
const EVENT_NAME = new Set(["EventAttributeName"]);
const EVENT_CONTENT = new Set(["LuauEventAttribute_content"]);
/** A bare `@e=name` handler, emitted by the grammar as its own node — which is
 *  the only reliable way to tell one from a call once a trailing comment is in
 *  the raw text. */
const EVENT_HANDLER_NAME = new Set(["LuauSparkleEventHandlerName"]);
const EVENT_CLOSURE = new Set(["LuauSparkleHandlerClosure"]);
const EVENT_CLOSURE_BODY = new Set(["LuauSparkleHandlerClosure_content"]);
const EVENT_CLOSURE_END = new Set(["LuauSparkleHandlerClosure_end"]);
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
 *  Three handler forms (L7):
 *   `@e=name`         → a `ref` (the runtime calls the named function);
 *   `@e=call(args)`   → a `call` whose binding (`__binding_N`) the runtime
 *                       evaluates for its effects;
 *   `@e={ stmts }`    → a `closure` whose binding is a hoisted function body of
 *                       statements (write-back: `@input={ name = event.value }`).
 *  All three expose `event` (the DOM payload) plus any enclosing loop vars. */
function readEvents(lineNode: SyntaxNode, ctx: LowerContext): EventBinding[] {
  const events: EventBinding[] = [];
  for (const attr of eventAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, EVENT_NAME);
    const event = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!event) continue;
    // Inline closure `{ … }` — its own grammar node (statements, not a table).
    const closureNode = firstDescendant(attr, EVENT_CLOSURE);
    if (closureNode) {
      events.push({
        event,
        handler: {
          kind: "closure",
          binding: lowerHandlerClosure(closureNode, ctx, ["event"]),
        },
      });
      continue;
    }
    // Prefer the node the grammar already produced for a bare handler name.
    // Re-reading the attribute's RAW TEXT instead meant a trailing comment
    // (`@click=use -- note`) failed the bare-name test and fell through to the
    // call branch, compiling to an empty evaluator: a button that runs nothing,
    // with no diagnostic. `LuauSparkleEventHandlerName` anticipates exactly
    // that comment, so read it rather than re-tokenizing.
    const refNode = firstDescendant(attr, EVENT_HANDLER_NAME);
    if (refNode) {
      events.push({
        event,
        handler: { kind: "ref", name: ctx.read(refNode.from, refNode.to).trim() },
      });
      continue;
    }
    const handlerNode = firstDescendant(attr, EVENT_CONTENT);
    const handlerText = handlerNode
      ? ctx.read(handlerNode.from, handlerNode.to).trim()
      : "";
    if (handlerNode && BARE_NAME_RE.test(handlerText)) {
      events.push({ event, handler: { kind: "ref", name: handlerText } });
    } else if (handlerNode) {
      events.push({
        event,
        // `event` is a reserved evaluator param so a call handler can pass it
        // (`@change=toggle(event)`); the runtime supplies the DOM event table.
        handler: {
          kind: "call",
          binding: lowerBinding(handlerNode, ctx, ["event"]),
        },
      });
    }
  }
  return events;
}

/** Compile an inline-closure handler (`@e={ stmts }`) into a {@link Binding}: a
 *  hoisted function `__binding_<from>(event, <loopvars>) <stmts> end`. Unlike
 *  {@link lowerBinding} (a single `return <expr>`), the body is the closure's
 *  STATEMENTS — lowered via the shared `lowerStatements` so every form works
 *  (assignment, property-target `a.b = x`, bare call). The reactive runtime
 *  evaluates it for its side effects (writes), then flushes affected bindings.
 *  `event` and loop vars are the function's parameters; references resolve to
 *  them at the call frame, while assigned game-state names resolve as globals. */
function lowerHandlerClosure(
  closureNode: SyntaxNode,
  ctx: LowerContext,
  extraParams: string[] = [],
): Binding {
  const exprId = `__binding_${documentTag(ctx.filePath)}${closureNode.from}`;
  const source = ctx.read(closureNode.from, closureNode.to);
  const span: SparkRange = {
    file: ctx.filePath,
    line: ctx.lineNumber(closureNode.from),
    from: closureNode.from,
    to: closureNode.to,
  };
  const loopVars = [...new Set([...(ctx.sparkleLoopVars ?? []), ...extraParams])]; // see lowerBinding
  // The attribute is line-oriented, so a closure whose `}` isn't on the `=`
  // line is force-closed at the newline — the grammar emits no
  // `LuauSparkleHandlerClosure_end` (closing brace). Surface that as an error
  // rather than silently dropping the statements past line 1.
  if (
    childrenByName(closureNode, EVENT_CLOSURE_END).length === 0 &&
    ctx.diagnostics
  ) {
    ctx.diagnostics.push({
      message:
        "Inline event handler is missing its closing `}`. Keep the whole handler on one line (multi-line handler bodies aren't supported) — use `;` to separate statements.",
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(closureNode.from) + 1,
        endLineNumber: ctx.lineNumber(closureNode.to) + 1,
        startCharacterNumber: ctx.characterNumber(closureNode.from) + 1,
        endCharacterNumber: ctx.characterNumber(closureNode.to) + 1,
      },
    });
  }
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const body = firstDescendant(closureNode, EVENT_CLOSURE_BODY);
    const stmts = lowerStatements(body, ctx);
    const fn = new Function(
      new Identifier(exprId),
      stmts,
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], closureNode.from, closureNode.to, ctx, true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    exprId,
    source,
    span,
    ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
  };
}

const PROP_ATTR = new Set(["LuauPropAttribute"]);
const PROP_NAME = new Set(["StyleAttributeName"]);
const PROP_INTERP = new Set([
  "LuauInterpolatedStringExpression",
  "LuauFunctionCallShorthand",
]);
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
 *  attributes. A `{expr}` value → a reactive binding; an interpolated quoted
 *  value (`"HP: {hp}"`) → a `content` PropValue (concatenated to a string at
 *  runtime, so quoted props interpolate like display content, spec D3); a plain
 *  `"string"`/literal → a literal. The runtime re-applies bound props on change. */
function readProps(
  lineNode: SyntaxNode,
  ctx: LowerContext,
): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  for (const attr of propAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, PROP_NAME);
    const name = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!name) continue;
    // Interpolated quoted value (`"HP: {hp}"`) — checked BEFORE the bare-`{expr}`
    // case, since the content-string node CONTAINS LuauInterpolatedStringExpression
    // children that would otherwise be mistaken for a lone binding.
    const contentStr = firstDescendant(attr, INTERP_CONTENT_NODES);
    if (contentStr) {
      props[name] = { kind: "content", content: readContentParts(contentStr, ctx) };
      continue;
    }
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
 *  (literal runs + `{expr}` / `{{fn}}` bindings) and plain values (a single
 *  literal part), resolving backslash escapes in literal text. */
function readContentParts(
  value: SyntaxNode | null,
  ctx: LowerContext,
): ContentPart[] {
  if (value && INTERP_CONTENT_NODES.has(value.name)) {
    // Each interp content node wraps its parts under a `<name>_content` child.
    const inner = firstDescendant(value, new Set([`${value.name}_content`]));
    const parts: ContentPart[] = [];
    let textBuf = "";
    const flush = () => {
      if (textBuf.length > 0) {
        parts.push({ kind: "literal", text: unescapeString(textBuf) });
        textBuf = "";
      }
    };
    let child = inner?.firstChild ?? null;
    while (child) {
      if (
        child.name === "LuauInterpolatedStringExpression" ||
        child.name === "LuauFunctionCallShorthand"
      ) {
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
  // Plain value → a single literal content part (unescape brace escapes for
  // strings; numbers/bools stringify).
  const literal = readLiteralValue(value, ctx);
  if (literal.kind === "literal") {
    const text =
      typeof literal.value === "string"
        ? unescapeString(literal.value)
        : String(literal.value);
    return [{ kind: "literal", text }];
  }
  return [{ kind: "binding", binding: literal.binding }];
}

/** Read a field-value node as a literal PropValue, used for inline props/style
 *  values (Luau-position values that are NOT reactive in v1). Display content
 *  goes through {@link readContentParts} instead. */
const PLAIN_STRING_CONTENT = new Set([
  "PlainStringContent",
  // Same role, but bounded by `'` — `PlainStringContent` stops at a double
  // quote, so it reads as empty inside single-quoted content that contains one.
  "PlainStringContentSingleQuoted",
]);

function readLiteralValue(value: SyntaxNode | null, ctx: LowerContext): PropValue {
  if (!value) return { kind: "literal", value: "" };
  if (PLAIN_CONTENT_NODES.has(value.name)) {
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
  // StylingValue / UnquotedStringFieldValue greedily include any trailing
  // `--`/`//` comment; drop it so it never leaks into the value.
  const raw = ctx.read(value.from, value.to).trim();
  return {
    kind: "literal",
    value: UNQUOTED_VALUE_NODES.has(value.name)
      ? stripTrailingLineComment(raw)
      : raw,
  };
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
      // An orphan: indented past this block but matching no open child block.
      // Dropping it is right — there is nowhere to put it — but dropping it
      // SILENTLY is not: the line simply disappeared from the layout with no
      // diagnostic, which reads as "my element does not work" rather than "my
      // indentation is wrong".
      warnOrphanLine(lines[i]!.node, ctx);
      i += 1;
      continue;
    }
    // Control block (`if … end`) — a self-contained grammar node; build it
    // recursively and place it at this indent level (its branch children carry
    // their own indentation). It consumes only its own line.
    if (lines[i]!.control) {
      children.push(buildControl(lines[i]!.node, ctx));
      i += 1;
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
        firstContentDescendant(kind, FIELD_VALUE_NAMES),
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
      const valueNode = firstContentDescendant(kind, FIELD_VALUE_NAMES);
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

    if (kind.name === "LuauStructComponentCall") {
      // `card("Inventory"):` / `stat_row(hero.name, hero.hp)` — invoke an authored
      // component (spec §4.7). The tag is the CustomComponentName; the paren args
      // are Luau expressions compiled to per-arg `Binding`s (evaluated in THIS —
      // the caller's — scope, so they capture the caller's loop vars). Child lines
      // are the default-slot content + `fill`s (attached like any container).
      const tagNode = firstDescendant(kind, NAME_TOKEN_NAMES);
      const tag = tagNode ? ctx.read(tagNode.from, tagNode.to).trim() : "";
      const element: ElementNode = {
        kind: "element",
        tag,
        classes: [],
        props: {},
        events: [],
        params: readComponentArgs(kind, ctx),
        children: [],
      };
      i = attachBlock(element, lines, i, childIndent, ctx);
      children.push(element);
      continue;
    }

    // Object header (`stage:` / `column #gap=16:`) or bare marker (`image` /
    // `mask shadow_1` / `text title "Inventory"` / `row #background-color={c}`)
    // → an element; the builtin/component token is the tag, other bare words are
    // classes, plus optional adjacency content + inline props/events.
    const { tag: parsedTag, classes } = tagAndClasses(kind, ctx);
    const tag = parsedTag ?? ctx.read(content.from, content.to).trim();
    // Component slots (spec §4.7): `slot [name]` is a leaf placeholder for
    // caller children; `fill [name]:` (caller side) targets a named slot and
    // carries children.
    //
    // Matched on the parsed tag, which is now the line's FIRST token — so a
    // slot whose NAME happens to be a builtin (`slot footer`, `slot header`,
    // `slot text`) stays a slot instead of lowering as that element with a
    // stray "slot" class. This used to need its own `first` field to bypass a
    // builtin-preferring tag rule; that rule is gone.
    const slotName = classes[0];
    if (parsedTag === "slot") {
      const slot: SlotNode = {
        kind: "slot",
        ...(slotName ? { name: slotName } : {}),
      };
      children.push(slot);
      i += 1;
      continue;
    }
    if (parsedTag === "fill") {
      const fill: FillNode = {
        kind: "fill",
        ...(slotName ? { name: slotName } : {}),
        children: [],
      };
      if (childIndent != null) {
        const sub = buildBlock(lines, i + 1, childIndent, ctx);
        fill.children = sub.children;
        i = sub.next;
      } else {
        i += 1;
      }
      children.push(fill);
      continue;
    }
    // A LEAF element line (`text "Body"`) carries its content as adjacency
    // content; a BLOCK-OPENING one (`accordion "More":`) is an object header,
    // where the grammar parses the same string as a plain `StringLiteral`.
    // Both mean "this element's content", so accept either — otherwise a label
    // on a block-opening line is silently dropped.
    const contentNode =
      firstContentDescendant(kind, FIELD_VALUE_NAMES) ??
      firstContentDescendant(kind, ELEMENT_HEADER_CONTENT_NAMES);
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

/** Direct children of `node` whose name is in `names`, in source order. */
function childrenByName(node: SyntaxNode, names: Set<string>): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  let c = node.firstChild;
  while (c) {
    if (names.has(c.name)) out.push(c);
    c = c.nextSibling;
  }
  return out;
}

/** Build the element-tree children of a control-flow branch body (a `_content`
 *  node), reconstructing element nesting from indentation. */
function buildBranchChildren(
  content: SyntaxNode | null,
  ctx: LowerContext,
): BodyNode[] {
  if (!content) return [];
  const items = collectNodeLines(content, ctx);
  if (items.length === 0) return [];
  // Same base-indent rule as `buildSparkleBody` (see `rebaseLines`): with the
  // first line's indent, a branch body whose opening line was indented deeper
  // than the rest ended the block-walk at the very next line and silently
  // discarded the remainder of the branch — without even the orphan warning,
  // because the walk EXITS on a shallower line rather than skipping it.
  const rebased = rebaseLines(items, ctx);
  return buildBlock(rebased.lines, 0, rebased.base, ctx).children;
}

const IF_CONDITION = new Set(["LuauIfBlockCondition"]);
const IF_CONDITION_CONTENT = new Set(["LuauIfBlockCondition_content"]);
const ELSEIF_CONDITION_CONTENT = new Set(["LuauElseifBlockCondition_content"]);

/** Compile a control-block condition node (the expression up to `then`) into a
 *  Binding the reactive runtime evaluates. Prefers the `_content` wrapper so the
 *  `then` keyword isn't included in the binding source. */
function lowerCondition(
  conditionNode: SyntaxNode,
  contentNames: Set<string>,
  ctx: LowerContext,
): Binding {
  return lowerBinding(
    firstDescendant(conditionNode, contentNames) ?? conditionNode,
    ctx,
  );
}

/** Build a control-flow BodyNode. `if` (IfNode) / `for` (ForNode); `match`/
 *  `slot`/`fill` follow. */
function buildControl(node: SyntaxNode, ctx: LowerContext): BodyNode {
  if (node.name === "LuauSparkleForLoop") return buildForNode(node, ctx);
  if (node.name === "LuauSparkleMatchBlock") return buildMatchNode(node, ctx);
  return buildIfNode(node, ctx);
}

const MATCH_CONDITION_CONTENT = new Set(["LuauSparkleMatchCondition_content"]);
const CASE_VALUE_CONTENT = new Set(["LuauSparkleCaseValue_content"]);

/** `LuauSparkleMatchBlock` → MatchNode (spec §4.6). `match <expr> do  case
 *  <value> …  [else …]  end`: each `case` arm (value + children) is a grammar
 *  child; `else` is the default. */
function buildMatchNode(matchBlock: SyntaxNode, ctx: LowerContext): MatchNode {
  const content = firstDescendant(
    matchBlock,
    new Set(["LuauSparkleMatchBlock_content"]),
  );
  const cases: MatchNode["cases"] = [];
  let elseChildren: BodyNode[] | undefined;
  let exprBinding: Binding | undefined;
  if (content) {
    const condNode = firstDescendant(
      content,
      new Set(["LuauSparkleMatchCondition"]),
    );
    if (condNode) {
      exprBinding = lowerCondition(condNode, MATCH_CONDITION_CONTENT, ctx);
    }
    for (const clause of childrenByName(
      content,
      new Set(["LuauSparkleCaseClause"]),
    )) {
      const valueNode = firstDescendant(
        clause,
        new Set(["LuauSparkleCaseValue"]),
      );
      const clauseContent = firstDescendant(
        clause,
        new Set(["LuauSparkleCaseClause_content"]),
      );
      if (valueNode) {
        cases.push({
          value: lowerCondition(valueNode, CASE_VALUE_CONTENT, ctx),
          children: buildBranchChildren(clauseContent, ctx),
        });
      }
    }
    const elseBlock = childrenByName(
      content,
      new Set(["LuauSparkleElseBlock"]),
    )[0];
    if (elseBlock) {
      const elseContent = firstDescendant(
        elseBlock,
        new Set(["LuauSparkleElseBlock_content"]),
      );
      elseChildren = buildBranchChildren(elseContent, ctx);
    }
  }
  const node: MatchNode = {
    kind: "match",
    expr: exprBinding ?? { exprId: "", source: "", span: { line: 0, from: 0, to: 0 } },
    cases,
  };
  if (elseChildren) node.else = elseChildren;
  return node;
}

const WS_NODE_NAMES = new Set([
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "Newline",
]);

/** Compile a list of sibling expression nodes (e.g. the iterable after `in`)
 *  into a Binding, mirroring {@link lowerBinding} but for a node LIST rather
 *  than a single container. */
function lowerBindingFromNodes(nodes: SyntaxNode[], ctx: LowerContext): Binding {
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const exprId = `__binding_${documentTag(ctx.filePath)}${first.from}`;
  const source = ctx.read(first.from, last.to);
  const span: SparkRange = {
    file: ctx.filePath,
    line: ctx.lineNumber(first.from),
    from: first.from,
    to: last.to,
  };
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])]; // see lowerBinding
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const expr = lowerExpressionFromNodes(nodes, ctx);
    const fn = new Function(
      new Identifier(exprId),
      [new ReturnType(expr ?? null)],
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], first.from, last.to, ctx, true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    exprId,
    source,
    span,
    ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
  };
}

/** `LuauSparkleForLoop` → ForNode (spec §4.6). `for <bindings> in <expr> do …
 *  [else …] end`: bindings = the loop variable name(s) before `in`; `each` =
 *  the iterable after `in`; `else` = the empty-iterable fallback. Numeric `for`
 *  (no `in`) is a follow-up. */
function buildForNode(forBlock: SyntaxNode, ctx: LowerContext): ForNode {
  const content = firstDescendant(
    forBlock,
    new Set(["LuauSparkleForLoop_content"]),
  );
  const condContent = content
    ? firstDescendant(content, new Set(["LuauForCondition_content"]))
    : null;
  let bindings: string[] = [];
  let each: Binding | undefined;
  let numeric: ForNode["numeric"] | undefined;
  if (condContent) {
    const inKw = firstDescendant(condContent, new Set(["LuauInKeyword"]));
    if (inKw) {
      bindings = ctx
        .read(condContent.from, inKw.from)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const iterableNodes: SyntaxNode[] = [];
      let c = condContent.firstChild;
      while (c) {
        if (c.from >= inKw.to && !WS_NODE_NAMES.has(c.name)) {
          iterableNodes.push(c);
        }
        c = c.nextSibling;
      }
      if (iterableNodes.length > 0) {
        each = lowerBindingFromNodes(iterableNodes, ctx);
      }
    } else {
      // Numeric `for i = from, to[, step] do` (no `in`). All three bounds are
      // lowered OUTSIDE the loop scope (the loop var isn't in scope for them).
      const parsed = parseNumericForHeader(condContent, ctx);
      if (parsed) {
        bindings = [parsed.loopVar];
        numeric = parsed.numeric;
      }
    }
  }
  const elseBlock = content
    ? childrenByName(content, new Set(["LuauSparkleElseBlock"]))[0]
    : undefined;
  // Lower the body WITH the loop variables in scope, so body bindings emit them
  // as evaluator params; the iterable (lowered above) and `else` (below) stay
  // OUTSIDE the loop scope (the loop var is undefined when the iterable is empty).
  ctx.sparkleLoopVars ??= [];
  const restoreLen = ctx.sparkleLoopVars.length;
  ctx.sparkleLoopVars.push(...bindings);
  const children = buildBranchChildren(content, ctx);
  ctx.sparkleLoopVars.length = restoreLen;
  const forNode: ForNode = {
    kind: "for",
    bindings,
    ...(each ? { each } : {}),
    ...(numeric ? { numeric } : {}),
    children,
  };
  if (elseBlock) {
    const elseContent = firstDescendant(
      elseBlock,
      new Set(["LuauSparkleElseBlock_content"]),
    );
    forNode.else = buildBranchChildren(elseContent, ctx);
  }
  return forNode;
}

/** Parse a numeric `for` header (`i = from, to[, step]`, no `in`) from its
 *  `LuauForCondition_content`. The loop var is the text before the `= from`
 *  assignment; `from` is the assignment's value; `to`/`step` are the
 *  comma-separated expressions after it. Returns null if it doesn't look
 *  numeric (no assignment / no `to`). */
function parseNumericForHeader(
  condContent: SyntaxNode,
  ctx: LowerContext,
): { loopVar: string; numeric: NonNullable<ForNode["numeric"]> } | null {
  const asn = firstDescendant(
    condContent,
    new Set(["LuauAssignmentOperation"]),
  );
  if (!asn) {
    return null;
  }
  const loopVar = ctx.read(condContent.from, asn.from).trim();
  if (!loopVar) {
    return null;
  }
  // `from` = the assignment value: its content nodes after the `=` operator.
  const asnContent = firstDescendant(
    asn,
    new Set(["LuauAssignmentOperation_content"]),
  );
  const fromNodes: SyntaxNode[] = [];
  let cc = asnContent?.firstChild ?? null;
  while (cc) {
    if (cc.name !== "LuauAssignmentOperator" && !WS_NODE_NAMES.has(cc.name)) {
      fromNodes.push(cc);
    }
    cc = cc.nextSibling;
  }
  // `to` / optional `step` = comma-separated expression groups after the
  // assignment operation.
  const groups: SyntaxNode[][] = [];
  let cur: SyntaxNode[] = [];
  let c = condContent.firstChild;
  while (c) {
    if (c.from >= asn.to && !WS_NODE_NAMES.has(c.name)) {
      if (c.name === "LuauCommaSeparator") {
        groups.push(cur);
        cur = [];
      } else {
        cur.push(c);
      }
    }
    c = c.nextSibling;
  }
  groups.push(cur);
  const nonEmpty = groups.filter((g) => g.length > 0);
  const toNodes = nonEmpty[0];
  const stepNodes = nonEmpty[1];
  if (fromNodes.length === 0 || !toNodes || toNodes.length === 0) {
    return null;
  }
  return {
    loopVar,
    numeric: {
      from: lowerBindingFromNodes(fromNodes, ctx),
      to: lowerBindingFromNodes(toNodes, ctx),
      ...(stepNodes && stepNodes.length > 0
        ? { step: lowerBindingFromNodes(stepNodes, ctx) }
        : {}),
    },
  };
}

/** `LuauSparkleIfBlock` → IfNode: the `if` + each `elseif` are branches
 *  (condition + children), `else` is the default. Branch bodies are the element
 *  lines inside each clause (grammar children — no sibling-index walking). */
function buildIfNode(ifBlock: SyntaxNode, ctx: LowerContext): IfNode {
  const ifContent = firstDescendant(
    ifBlock,
    new Set(["LuauSparkleIfBlock_content"]),
  );
  const branches: IfNode["branches"] = [];
  if (ifContent) {
    const ifCond = firstDescendant(ifContent, IF_CONDITION);
    if (ifCond) {
      branches.push({
        condition: lowerCondition(ifCond, IF_CONDITION_CONTENT, ctx),
        children: buildBranchChildren(ifContent, ctx),
      });
    }
    for (const elseif of childrenByName(
      ifContent,
      new Set(["LuauSparkleElseifBlock"]),
    )) {
      const elseifContent = firstDescendant(
        elseif,
        new Set(["LuauSparkleElseifBlock_content"]),
      );
      const cond = firstDescendant(
        elseif,
        new Set(["LuauElseifBlockCondition"]),
      );
      if (cond) {
        branches.push({
          condition: lowerCondition(cond, ELSEIF_CONDITION_CONTENT, ctx),
          children: buildBranchChildren(elseifContent, ctx),
        });
      }
    }
    const elseBlock = childrenByName(
      ifContent,
      new Set(["LuauSparkleElseBlock"]),
    )[0];
    if (elseBlock) {
      const elseContent = firstDescendant(
        elseBlock,
        new Set(["LuauSparkleElseBlock_content"]),
      );
      return { kind: "if", branches, else: buildBranchChildren(elseContent, ctx) };
    }
  }
  return { kind: "if", branches };
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
  // Stamp per-token metadata on binding expression nodes so a resolution error
  // lands on the exact identifier rather than the whole binding span (scoped to
  // Sparkle bodies — see LowerContext.stampExpressionSpans).
  const prevStamp = ctx.stampExpressionSpans;
  ctx.stampExpressionSpans = true;
  try {
    const rebased = rebaseLines(lines, ctx);
    return buildBlock(rebased.lines, 0, rebased.base, ctx).children;
  } finally {
    ctx.stampExpressionSpans = prevStamp;
  }
}

/** Choose a body's base indent, treating a lone anomalous line as the error
 *  rather than the truth.
 *
 *  The base is the SHALLOWEST line, not the first one: taking the first
 *  line's indent meant a body whose opening line was indented deeper than
 *  the rest ended the block-walk at the very next line and silently
 *  discarded everything after it.
 *
 *  But a bare minimum is symmetric-fragile the other way (#369): one
 *  accidentally DEDENTED line becomes the base and every properly-indented
 *  line reads as an orphan — the whole layout replaced by the stray. So a
 *  SINGLETON at the minimum that is not the opening line is treated as the
 *  anomaly: it is warned as an orphan, excluded, and the base re-derived
 *  from the rest. (When two or more lines share the minimum, they win — the
 *  deep-first case has its whole tail there, and with several lines at one
 *  level the author's intent is genuinely that level.) */
function rebaseLines(
  lines: NodeLine[],
  ctx: LowerContext,
): { base: number; lines: NodeLine[] } {
  let working = lines;
  for (;;) {
    const base = working.reduce(
      (m, l) => Math.min(m, l.indent),
      working[0]!.indent,
    );
    const atBase = working.filter((l) => l.indent === base);
    if (
      working.length > 1 &&
      atBase.length === 1 &&
      working[0]!.indent !== base
    ) {
      warnOrphanLine(atBase[0]!.node, ctx);
      working = working.filter((l) => l !== atBase[0]);
      continue;
    }
    return { base, lines: working };
  }
}

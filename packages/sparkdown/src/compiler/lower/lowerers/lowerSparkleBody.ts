import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { ErrorType } from "../../../inkjs/engine/Error";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import {
  collectForLoopTargetNames,
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
  type ForNode,
  type IfNode,
  type MatchNode,
  type PropValue,
} from "../../types/SparkleNode";
import { type SparkRange } from "../../types/SparkRange";
import { stampDebugMetadata } from "../utils/debugMetadata";
import {
  closeFunctionBody,
  lowerEvaluatorStatement,
  openEvaluatorBody,
} from "../utils/statementShape";
import { documentTag } from "../utils/documentTag";
import { unescapeString } from "../utils/unescapeString";
import { structValueNode } from "../utils/structValueNode";
import {
  sparkleBlockContent,
  sparkleBlockEntries,
  sparkleElementParts,
  sparklePartNodes,
} from "../utils/sparkleBlockEntries";
import { joinSparkleContinuations } from "../utils/sparkleContinuations";

// Build the reactive UI tree from element parts and explicit block nesting.
const CONTROL_BLOCK_NAMES = nodeNameSet([
  "LuauSparkleIfBlock", "LuauSparkleForLoop", "LuauSparkleMatchBlock",
]);
const CONTROL_CLAUSE_NAMES = nodeNameSet([
  "LuauSparkleElseifBlock", "LuauSparkleElseBlock", "LuauSparkleCaseClause",
]);

/** Top-level lines and control blocks; nested entries are read by their owner. */
function buildBodyEntries(content: SyntaxNode | null, ctx: LowerContext): BodyNode[] {
  if (!content) return [];
  const children: BodyNode[] = [];
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauSparkleBlockLine") children.push(...buildBracedEntries(child, ctx).children);
      else if (CONTROL_BLOCK_NAMES.has(child.name)) children.push(buildControl(child, ctx));
      else if (!CONTROL_CLAUSE_NAMES.has(child.name)) walk(child);
    }
  };
  walk(content);
  return children;
}

const KEY_TOKEN_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "DeclarationScalarPropertyKey",
]);

const FIELD_VALUE_NAMES = nodeNameSet([
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
const INTERP_CONTENT_NODES = nodeNameSet([
  "StringFieldValueInterpolated",
  "LuauElementContentStringInterpolated",
]);
// Plain (non-interpolated) quoted content-string nodes — read as a literal.
const PLAIN_CONTENT_NODES = nodeNameSet([
  "StringFieldValue",
  "LuauElementContentStringPlain",
  // Single-quoted content never interpolates, so it is always read literally —
  // which is exactly why an author reaches for it (e.g. text containing `{`).
  "LuauElementContentStringSingleQuoted",
]);

/** Every binding evaluator's name starts with this. */
export const BINDING_ID_PREFIX = "__binding_";

/** The evaluator name for a binding whose source starts at `from`:
 *  `__binding_<document tag><kind>_<name>_<offset within the chunk>`, as in
 *  `__binding_file_3a_2f_2fproj_2fmain_2esd__layout_hud_23`.
 *
 *  Every hoisted evaluator lands in one flow namespace, so the name carries
 *  the document: two files whose first binding starts at the same offset, as
 *  a copy-and-adapt pair of layout files will, would otherwise share one
 *  evaluator and one layout would render the other's value.
 *
 *  Within the document the name comes from the layout or component that holds
 *  the binding and the binding's place in its chunk, not from the binding's
 *  place in the document. A chunk an edit does not touch is carried into the
 *  next compile without being lowered again, so a name taken from its
 *  document offset would keep the offset it had before the edit while a cold
 *  compile of the same text takes the new one. Two chunks of one document
 *  mint the same name only when they declare the same layout or component
 *  twice; the later declaration replaces the earlier one, and the compiler
 *  keeps the later chunk's evaluator to match. A caller without a chunk (the
 *  snapshot lowerers) names the binding by its offset. */
function bindingId(from: number, ctx: LowerContext): string {
  const tag = documentTag(ctx.filePath);
  if (ctx.chunkFrom === undefined || ctx.sparkleOwner === undefined) {
    return `${BINDING_ID_PREFIX}${tag}${from}`;
  }
  return `${BINDING_ID_PREFIX}${tag}${ctx.sparkleOwner}_${from - ctx.chunkFrom}`;
}

// A binding handle's span, relative to the chunk being lowered. The compiler
// adds the chunk's document position when it merges the chunk's trees into
// `program.sparkle` (see `rebaseSparkleSpans`), so a chunk carried unlowered
// into a later compile still gives its handles' current positions.
function bindingSpan(from: number, to: number, ctx: LowerContext): SparkRange {
  const chunkFrom = ctx.chunkFrom ?? 0;
  return {
    file: ctx.filePath,
    line: ctx.lineNumber(from),
    from: from - chunkFrom,
    to: to - chunkFrom,
  };
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
const ATTRIBUTE_NODES = nodeNameSet([
  "LuauEventAttribute",
  "LuauPropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparklePropAttribute",
  "LuauSparkleEventClosureAttribute",
]);

/** A block entry the element before it takes (a continuation line, or a
 *  block on a line of its own), or a continuation line that follows no
 *  element. Neither is an entry of its own. */
function isContinuation(entry: SyntaxNode, ctx: LowerContext): boolean {
  return (
    entry.name === "LuauSparkleElementContinuation" ||
    !!ctx.sparkleJoins?.joined.has(entry.from)
  );
}

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
 *  `__binding_<id>() return <expr> end` hoisted into `ctx.hoistedKnots`, plus
 *  the handle the AST carries. The reactive runtime (Phase 3) calls the hoisted
 *  function to evaluate the binding (and, later, track its reads for deps); the
 *  compiler only produces the handle + the function. Bindings read game-state
 *  globals by name, so the function is nullary — no upvalue capture (one-way
 *  binding, spec L6). {@link bindingId} names it. */
function lowerBinding(
  interpNode: SyntaxNode,
  ctx: LowerContext,
  extraParams: string[] = [],
): Binding {
  const exprId = bindingId(interpNode.from, ctx);
  const source = ctx.read(interpNode.from, interpNode.to);
  const span = bindingSpan(interpNode.from, interpNode.to, ctx);
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
    // call shape as `lowerInterpolatedString`). With statement shapes on, the
    // evaluator's body is recorded as the one statement it returns, for the
    // binary program (`openEvaluatorBody`).
    const body = openEvaluatorBody(ctx, interpNode.from, interpNode.to);
    const fn = new Function(
      new Identifier(exprId),
      lowerEvaluatorStatement(ctx, body, interpNode, interpNode, () => [
        new ReturnType(lowerExpressionFromContainer(interpNode, ctx) ?? null),
      ]),
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    // Stamp the hoisted evaluator with the binding's source span so a compile
    // error inside it (e.g. an undefined `{player.inventory}`) reports at the
    // binding, not at line 0 (a Function with no debugMetadata makes the
    // inner-node error walk hit null → 0:0). remapContent later rebases it.
    stampDebugMetadata([fn], interpNode.from, interpNode.to, ctx);
    closeFunctionBody(ctx, body, fn, interpNode, [], true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    exprId,
    source,
    span,
    ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
  };
}

const COMPONENT_CALL_CONTENT = nodeNameSet([
  "LuauSparkleCallArguments_content",
]);
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
  const exprId = bindingId(first.from, ctx);
  const source = ctx.read(first.from, last.to);
  const span = bindingSpan(first.from, last.to, ctx);
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])]; // see lowerBinding
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const body = openEvaluatorBody(ctx, first.from, last.to);
    const fn = new Function(
      new Identifier(exprId),
      lowerEvaluatorStatement(ctx, body, first, last, () => [
        new ReturnType(lowerExpressionFromNodes(argNodes, ctx) ?? null),
      ]),
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], first.from, last.to, ctx);
    closeFunctionBody(ctx, body, fn, { from: first.from, to: last.to }, [], true);
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

const EVENT_ATTR = nodeNameSet([
  "LuauEventAttribute",
  "LuauSparkleEventAttribute",
  // An event closure that goes on at the next line.
  "LuauSparkleEventClosureAttribute",
]);
const EVENT_NAME = nodeNameSet(["EventAttributeName"]);
const EVENT_CONTENT = nodeNameSet([
  "LuauEventAttribute_content",
  // In a brace block, the handler is its own node (see `handlerContent`).
  "LuauSparkleEventHandler",
]);
/** A bare `@e=name` handler, emitted by the grammar as its own node — which is
 *  the only reliable way to tell one from a call once a trailing comment is in
 *  the raw text. */
const EVENT_HANDLER_NAME = nodeNameSet(["LuauSparkleEventHandlerName"]);
const EVENT_CLOSURE = nodeNameSet(["LuauSparkleHandlerClosure"]);
const EVENT_CLOSURE_BODY = nodeNameSet(["LuauSparkleHandlerClosure_content"]);
const EVENT_CLOSURE_END = nodeNameSet(["LuauSparkleHandlerClosure_end"]);
const BARE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** DFS: every `LuauEventAttribute` descendant, in source order, or the node
 *  itself when it is one. */
function eventAttributes(node: SyntaxNode): SyntaxNode[] {
  if (EVENT_ATTR.has(node.name)) return [node];
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
    const handlerNode = handlerContent(firstDescendant(attr, EVENT_CONTENT));
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

/** The node that holds a handler expression. */
function handlerContent(node: SyntaxNode | null): SyntaxNode | null {
  if (node?.name === "LuauSparkleEventHandler") return node.firstChild ?? node;
  return node;
}

/** Worded like the message for a layout block left open
 *  (`UNCLOSED_SPARKLE_BLOCK`). */
export const UNCLOSED_HANDLER_CLOSURE =
  "This handler is missing its closing `}`. Without it, the handler runs to the next line that starts with `end`, `else`, `elseif` or `case`, the next `scene` or `branch`, or the end of the file.";

/** Compile an inline-closure handler (`@e={ stmts }`) into a {@link Binding}: a
 *  hoisted function `__binding_<id>(event, <loopvars>) <stmts> end`. Unlike
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
  const exprId = bindingId(closureNode.from, ctx);
  const source = ctx.read(closureNode.from, closureNode.to);
  const span = bindingSpan(closureNode.from, closureNode.to, ctx);
  const loopVars = [...new Set([...(ctx.sparkleLoopVars ?? []), ...extraParams])]; // see lowerBinding
  const closeBrace = childrenByName(closureNode, EVENT_CLOSURE_END)[0];
  if ((!closeBrace || closeBrace.to === closeBrace.from) && ctx.diagnostics) {
    const open = closureNode.from;
    ctx.diagnostics.push({
      // With no end at all, the closure stopped at the end of its line.
      message: closeBrace
        ? UNCLOSED_HANDLER_CLOSURE
        : "This handler is missing its closing `}`.",
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(open) + 1,
        endLineNumber: ctx.lineNumber(open + 1) + 1,
        startCharacterNumber: ctx.characterNumber(open) + 1,
        endCharacterNumber: ctx.characterNumber(open + 1) + 1,
      },
    });
  }
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const body = firstDescendant(closureNode, EVENT_CLOSURE_BODY);
    // With statement shapes on, each statement of the closure is recorded on
    // the evaluator's body, for the binary program (`openEvaluatorBody`).
    const shape = openEvaluatorBody(ctx, closureNode.from, closureNode.to);
    const stmts = lowerStatements(body, ctx, undefined, shape);
    const fn = new Function(
      new Identifier(exprId),
      stmts,
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], closureNode.from, closureNode.to, ctx);
    closeFunctionBody(ctx, shape, fn, closureNode, [], true);
    ctx.hoistedKnots.push(fn);
  }
  return {
    exprId,
    source,
    span,
    ...(loopVars.length > 0 ? { params: [...loopVars] } : {}),
  };
}

const PROP_ATTR = nodeNameSet(["LuauPropAttribute", "LuauSparklePropAttribute"]);
const PROP_NAME = nodeNameSet(["StyleAttributeName"]);
const PROP_INTERP = nodeNameSet([
  "LuauInterpolatedStringExpression",
  "LuauFunctionCallShorthand",
]);
const PROP_QUOTED = nodeNameSet(["InlinePropQuotedValue"]);
const PROP_LITERAL = nodeNameSet(["InlinePropLiteralValue"]);

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
  if (literal.kind === "content") {
    return literal.content;
  }
  return [{ kind: "binding", binding: literal.binding }];
}

/** Read a field-value node as a literal PropValue, used for inline props/style
 *  values (Luau-position values that are NOT reactive in v1). Display content
 *  goes through {@link readContentParts} instead. */
const PLAIN_STRING_CONTENT = nodeNameSet([
  "PlainStringContent",
  // Same role, but bounded by `'` — `PlainStringContent` stops at a double
  // quote, so it reads as empty inside single-quoted content that contains one.
  "PlainStringContentSingleQuoted",
]);

function readLiteralValue(field: SyntaxNode | null, ctx: LowerContext): PropValue {
  if (!field) return { kind: "literal", value: "" };
  // A value with a trailing comment reads only its value node.
  const value = structValueNode(field);
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
  return { kind: "literal", value: ctx.read(value.from, value.to).trim() };
}

/** An element's parts, as {@link readParts} reads them. */
interface ElementParts {
  classes: string[];
  content?: ContentPart[];
  props: Record<string, PropValue>;
  events: EventBinding[];
}

/** Read the parts an element's part nodes hold (`sparklePartNodes`), in
 *  source order: its classes, its first content, its `#prop`s (a later one
 *  wins) and its `@event`s. An event closure holds no part but its event. */
function readParts(parts: SyntaxNode[], ctx: LowerContext): ElementParts {
  const out: ElementParts = { classes: partClasses(parts, ctx), props: {}, events: [] };
  for (const part of parts) {
    if (part.name !== "LuauSparkleEventClosureAttribute") {
      if (!out.content) {
        const contentNode = firstContentDescendant(part, FIELD_VALUE_NAMES);
        if (contentNode) out.content = readContentParts(contentNode, ctx);
      }
      Object.assign(out.props, readProps(part, ctx));
    }
    out.events.push(...readEvents(part, ctx));
  }
  return out;
}

/** The classes the part nodes hold (`sparklePartNodes`), in source order:
 *  each `.name`, and each bare word after an element's name. An event
 *  closure holds none. */
function partClasses(parts: SyntaxNode[], ctx: LowerContext): string[] {
  return parts.flatMap((part) =>
    part.name === "LuauSparkleEventClosureAttribute"
      ? []
      : descendants(part, HEAD_CLASS_NAMES)
          .map((t) => ctx.read(t.from, t.to).trim())
          .filter(Boolean),
  );
}

/** The part nodes of the continuation lines the element keyed `key` (its
 *  node's `from`) takes, in source order. */
function continuationPartNodes(key: number, ctx: LowerContext): SyntaxNode[] {
  return (ctx.sparkleJoins?.continuations.get(key) ?? []).flatMap((line) =>
    sparklePartNodes(line),
  );
}

/** The classes in an element's head: each `.name`, and each bare word after
 *  its name, in source order. */
const HEAD_CLASS_NAMES = nodeNameSet([
  "LuauSparkleClassName",
]);

/** The entries of a brace block (`container` is a block line, or the content
 *  of a block or of a control block's branch): the elements and control
 *  blocks it holds, and the style props its `key = value` lines set on the
 *  element around it. The entries nest by their braces, so indentation plays
 *  no part. */
function buildBracedEntries(
  container: SyntaxNode,
  ctx: LowerContext,
): { children: BodyNode[]; props: Record<string, PropValue> } {
  const children: BodyNode[] = [];
  const props: Record<string, PropValue> = {};
  for (const entry of sparkleBlockEntries(container)) {
    if (isContinuation(entry, ctx)) {
      // Read with the element it continues; one that continues nothing is
      // reported by the validator.
      continue;
    }
    if (entry.name === "LuauSparkleElement") {
      children.push(buildBracedElement(entry, ctx));
    } else if (entry.name === "LuauStructBlockProperty") {
      // `image = "black"` (a builtin key) is an element whose content is the
      // value; any other key is a style prop.
      const keyNode = firstDescendant(entry, KEY_TOKEN_NAMES);
      const valueNode = firstContentDescendant(entry, FIELD_VALUE_NAMES);
      const key = keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : "";
      if (keyNode?.name === "BuiltinComponentName") {
        children.push({
          kind: "element",
          tag: key,
          classes: [],
          content: readContentParts(valueNode, ctx),
          props: {},
          events: [],
          children: [],
        });
      } else if (key) {
        props[key] = readLiteralValue(valueNode, ctx);
      }
    } else if (entry.name !== "LuauSparkleElementBlock") {
      children.push(buildControl(entry, ctx));
    }
    // A block with no element before it holds nothing an element can take;
    // the validator reports it.
  }
  return { children, props };
}

/** Build an element, component call, slot or fill from its explicit block. */
function buildBracedElement(node: SyntaxNode, ctx: LowerContext): BodyNode {
  const { name, args, block } = sparkleElementParts(node);
  const tag = name ? ctx.read(name.from, name.to).trim() : "";
  // The element's parts, on its line and after a closure that goes on at
  // the next line, then those of the continuation lines it takes.
  const parts = [
    ...sparklePartNodes(node),
    ...continuationPartNodes(node.from, ctx),
  ];
  const blockContent = block
    ? sparkleBlockContent(block)
    : (() => {
        const later = ctx.sparkleJoins?.blocks.get(node.from);
        return later ? sparkleBlockContent(later) : null;
      })();
  const buildBlockEntries = () =>
    blockContent
      ? buildBracedEntries(blockContent, ctx)
      : { children: [] as BodyNode[], props: {} as Record<string, PropValue> };
  // A named slot or fill uses its first dotted class as the name.
  if (tag === "slot" || tag === "fill") {
    const name = partClasses(parts, ctx)[0];
    return tag === "slot"
      ? { kind: "slot", ...(name ? { name } : {}) }
      : {
          kind: "fill",
          ...(name ? { name } : {}),
          children: buildBlockEntries().children,
        };
  }
  // Content on an element with a block is read as a leaf's is, so `{expr}` in
  // it binds.
  const read = readParts(parts, ctx);
  const element: ElementNode = {
    kind: "element",
    tag,
    classes: read.classes,
    ...(read.content ? { content: read.content } : {}),
    props: read.props,
    events: read.events,
    ...(args ? { params: readComponentArgs(args, ctx) } : {}),
    children: [],
  };
  const sub = buildBlockEntries();
  element.children = sub.children;
  if (Object.keys(sub.props).length > 0) {
    element.props = { ...element.props, ...sub.props };
  }
  return element;
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

const IF_CONTENT = nodeNameSet([
  "LuauSparkleIfBlock_content",
  "LuauSparkleBlockIf_content",
]);
const ELSEIF_CLAUSE = nodeNameSet([
  "LuauSparkleElseifBlock",
  "LuauSparkleBlockElseif",
]);
const ELSEIF_CONTENT = nodeNameSet([
  "LuauSparkleElseifBlock_content",
  "LuauSparkleBlockElseif_content",
]);
const ELSE_CLAUSE = nodeNameSet(["LuauSparkleElseBlock", "LuauSparkleBlockElse"]);
const ELSE_CONTENT = nodeNameSet([
  "LuauSparkleElseBlock_content",
  "LuauSparkleBlockElse_content",
]);
const FOR_CONTENT = nodeNameSet([
  "LuauSparkleForLoop_content",
  "LuauSparkleBlockFor_content",
]);
const MATCH_CONTENT = nodeNameSet([
  "LuauSparkleMatchBlock_content",
  "LuauSparkleBlockMatch_content",
]);
const CASE_CLAUSE = nodeNameSet(["LuauSparkleCaseClause", "LuauSparkleBlockCase"]);
const CASE_CONTENT = nodeNameSet([
  "LuauSparkleCaseClause_content",
  "LuauSparkleBlockCase_content",
]);
// A branch of a control block inside a brace block holds block entries.
const BRACED_BRANCH_CONTENT = nodeNameSet([
  "LuauSparkleBlockIf_content",
  "LuauSparkleBlockElseif_content",
  "LuauSparkleBlockElse_content",
  "LuauSparkleBlockFor_content",
  "LuauSparkleBlockCase_content",
]);

/** Build the children owned by a control-flow branch. */
function buildBranchChildren(
  content: SyntaxNode | null,
  ctx: LowerContext,
): BodyNode[] {
  if (!content) return [];
  return BRACED_BRANCH_CONTENT.has(content.name)
    ? buildBracedEntries(content, ctx).children
    : buildBodyEntries(content, ctx);
}

const IF_CONDITION = nodeNameSet(["LuauIfBlockCondition"]);
const IF_CONDITION_CONTENT = nodeNameSet(["LuauIfBlockCondition_content"]);
const ELSEIF_CONDITION_CONTENT = nodeNameSet(["LuauElseifBlockCondition_content"]);

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
  if (node.name === "LuauSparkleForLoop" || node.name === "LuauSparkleBlockFor") {
    return buildForNode(node, ctx);
  }
  if (
    node.name === "LuauSparkleMatchBlock" ||
    node.name === "LuauSparkleBlockMatch"
  ) {
    return buildMatchNode(node, ctx);
  }
  return buildIfNode(node, ctx);
}

const MATCH_CONDITION_CONTENT = nodeNameSet(["LuauSparkleMatchCondition_content"]);
const CASE_VALUE_CONTENT = nodeNameSet(["LuauSparkleCaseValue_content"]);

/** `LuauSparkleMatchBlock` → MatchNode (spec §4.6). `match <expr> do  case
 *  <value> …  [else …]  end`: each `case` arm (value + children) is a grammar
 *  child; `else` is the default. */
function buildMatchNode(matchBlock: SyntaxNode, ctx: LowerContext): MatchNode {
  const content = firstDescendant(matchBlock, MATCH_CONTENT);
  const cases: MatchNode["cases"] = [];
  let elseChildren: BodyNode[] | undefined;
  let exprBinding: Binding | undefined;
  if (content) {
    const condNode = firstDescendant(
      content,
      nodeNameSet(["LuauSparkleMatchCondition"]),
    );
    if (condNode) {
      exprBinding = lowerCondition(condNode, MATCH_CONDITION_CONTENT, ctx);
    }
    for (const clause of childrenByName(content, CASE_CLAUSE)) {
      const valueNode = firstDescendant(
        clause,
        nodeNameSet(["LuauSparkleCaseValue"]),
      );
      const clauseContent = firstDescendant(clause, CASE_CONTENT);
      if (valueNode) {
        cases.push({
          value: lowerCondition(valueNode, CASE_VALUE_CONTENT, ctx),
          children: buildBranchChildren(clauseContent, ctx),
        });
      }
    }
    const elseBlock = childrenByName(content, ELSE_CLAUSE)[0];
    if (elseBlock) {
      const elseContent = firstDescendant(elseBlock, ELSE_CONTENT);
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

const WS_NODE_NAMES = nodeNameSet([
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
  const exprId = bindingId(first.from, ctx);
  const source = ctx.read(first.from, last.to);
  const span = bindingSpan(first.from, last.to, ctx);
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])]; // see lowerBinding
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const body = openEvaluatorBody(ctx, first.from, last.to);
    const fn = new Function(
      new Identifier(exprId),
      lowerEvaluatorStatement(ctx, body, first, last, () => [
        new ReturnType(lowerExpressionFromNodes(nodes, ctx) ?? null),
      ]),
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], first.from, last.to, ctx);
    closeFunctionBody(ctx, body, fn, { from: first.from, to: last.to }, [], true);
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
  const content = firstDescendant(forBlock, FOR_CONTENT);
  const condContent = content
    ? firstDescendant(content, nodeNameSet(["LuauForCondition_content"]))
    : null;
  let bindings: string[] = [];
  let each: Binding | undefined;
  let numeric: ForNode["numeric"] | undefined;
  if (condContent) {
    const inKw = firstDescendant(condContent, nodeNameSet(["LuauInKeyword"]));
    if (inKw) {
      // Each variable is a path of its own before `in`; a type annotation
      // after one is not, so a comma inside its type is not a separator
      // (`for k: {a: number, b: string}, v in scores`).
      bindings = collectForLoopTargetNames(condContent, ctx);
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
  const elseBlock = content ? childrenByName(content, ELSE_CLAUSE)[0] : undefined;
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
    const elseContent = firstDescendant(elseBlock, ELSE_CONTENT);
    forNode.else = buildBranchChildren(elseContent, ctx);
  }
  return forNode;
}

/** Parse a numeric `for` header (`i = from, to[, step]`, no `in`) from its
 *  `LuauForCondition_content`. The loop var is the name before the `= from`
 *  assignment; `from` is the assignment's value; `to`/`step` are the
 *  comma-separated expressions after it. Returns null if it doesn't look
 *  numeric (no assignment / no `to`). */
function parseNumericForHeader(
  condContent: SyntaxNode,
  ctx: LowerContext,
): { loopVar: string; numeric: NonNullable<ForNode["numeric"]> } | null {
  const asn = firstDescendant(
    condContent,
    nodeNameSet(["LuauAssignmentOperation"]),
  );
  if (!asn) {
    return null;
  }
  const loopVar = collectForLoopTargetNames(condContent, ctx)[0];
  if (!loopVar) {
    return null;
  }
  // `from` = the assignment value: its content nodes after the `=` operator.
  const asnContent = firstDescendant(
    asn,
    nodeNameSet(["LuauAssignmentOperation_content"]),
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
  const ifContent = firstDescendant(ifBlock, IF_CONTENT);
  const branches: IfNode["branches"] = [];
  if (ifContent) {
    const ifCond = firstDescendant(ifContent, IF_CONDITION);
    if (ifCond) {
      branches.push({
        condition: lowerCondition(ifCond, IF_CONDITION_CONTENT, ctx),
        children: buildBranchChildren(ifContent, ctx),
      });
    }
    for (const elseif of childrenByName(ifContent, ELSEIF_CLAUSE)) {
      const elseifContent = firstDescendant(elseif, ELSEIF_CONTENT);
      const cond = firstDescendant(
        elseif,
        nodeNameSet(["LuauElseifBlockCondition"]),
      );
      if (cond) {
        branches.push({
          condition: lowerCondition(cond, ELSEIF_CONDITION_CONTENT, ctx),
          children: buildBranchChildren(elseifContent, ctx),
        });
      }
    }
    const elseBlock = childrenByName(ifContent, ELSE_CLAUSE)[0];
    if (elseBlock) {
      const elseContent = firstDescendant(elseBlock, ELSE_CONTENT);
      return { kind: "if", branches, else: buildBranchChildren(elseContent, ctx) };
    }
  }
  return { kind: "if", branches };
}

/** Build the reactive AST body (BodyNode[]) for a screen/component content
 *  node, reading the grammar's separated tokens. */
export function buildSparkleBody(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): BodyNode[] {
  const prevJoins = ctx.sparkleJoins;
  ctx.sparkleJoins = joinSparkleContinuations(contentNode);
  // Stamp per-token metadata on binding expression nodes, which the synthetic
  // functions bindings are hoisted into cannot inherit from a statement
  // (scoped to Sparkle bodies — see LowerContext.stampExpressionSpans).
  const prevStamp = ctx.stampExpressionSpans;
  ctx.stampExpressionSpans = true;
  try {
    return buildBodyEntries(contentNode, ctx);
  } finally {
    ctx.stampExpressionSpans = prevStamp;
    ctx.sparkleJoins = prevJoins;
  }
}

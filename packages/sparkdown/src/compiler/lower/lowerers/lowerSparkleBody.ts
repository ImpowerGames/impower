import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { ErrorType } from "../../../runtime/Error";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import {
  inFunctionScopes,
  reportBodySyntaxErrors,
} from "../expression/lowerFunction";
import { closureBodyAst, closureSyntaxErrors, documentText } from "../utils/luauAst";
import { closureReadingErrors } from "../../typecheck/closureReading";
import { reportErasedConstErrors } from "../utils/publishesConst";
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

const CONTROL_BLOCK_NAMES = nodeNameSet([
  "LuauSparkleIfBlock", "LuauSparkleForLoop", "LuauSparkleMatchBlock",
]);
const CONTROL_CLAUSE_NAMES = nodeNameSet([
  "LuauSparkleElseifBlock", "LuauSparkleElseBlock", "LuauSparkleCaseClause",
]);

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

const INTERP_CONTENT_NODES = nodeNameSet([
  "StringFieldValueInterpolated",
  "LuauElementContentStringInterpolated",
]);
const PLAIN_CONTENT_NODES = nodeNameSet([
  "StringFieldValue",
  "LuauElementContentStringPlain",
  "LuauElementContentStringSingleQuoted",
]);

export const BINDING_ID_PREFIX = "__binding$";

function bindingId(from: number, ctx: LowerContext): string {
  const tag = documentTag(ctx.filePath);
  if (ctx.chunkFrom === undefined || ctx.sparkleOwner === undefined) {
    return `${BINDING_ID_PREFIX}${tag}${from}`;
  }
  return `${BINDING_ID_PREFIX}${tag}${ctx.sparkleOwner}_${from - ctx.chunkFrom}`;
}

function bindingSpan(from: number, to: number, ctx: LowerContext): SparkRange {
  const chunkFrom = ctx.chunkFrom ?? 0;
  return {
    file: ctx.filePath,
    line: ctx.lineNumber(from),
    from: from - chunkFrom,
    to: to - chunkFrom,
  };
}

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

const ATTRIBUTE_NODES = nodeNameSet([
  "LuauEventAttribute",
  "LuauPropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparklePropAttribute",
  "LuauSparkleEventClosureAttribute",
]);

function isContinuation(entry: SyntaxNode, ctx: LowerContext): boolean {
  return (
    entry.name === "LuauSparkleElementContinuation" ||
    !!ctx.sparkleJoins?.joined.has(entry.from)
  );
}

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

function lowerBinding(
  interpNode: SyntaxNode,
  ctx: LowerContext,
  extraParams: string[] = [],
): Binding {
  const exprId = bindingId(interpNode.from, ctx);
  const source = ctx.read(interpNode.from, interpNode.to);
  const span = bindingSpan(interpNode.from, interpNode.to, ctx);
  const loopVars = [...new Set([...(ctx.sparkleLoopVars ?? []), ...extraParams])];
  const already = ctx.hoistedKnots?.some(
    (o) => o instanceof Function && o.identifier?.name === exprId,
  );
  if (!already && ctx.hoistedKnots) {
    const body = openEvaluatorBody(ctx, interpNode.from, interpNode.to);
    const fn = new Function(
      new Identifier(exprId),
      lowerEvaluatorStatement(ctx, body, interpNode, interpNode, () => [
        new ReturnType(lowerExpressionFromContainer(interpNode, ctx) ?? null),
      ]),
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
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
const ARG_SKIP_RE = /Whitespace|Newline|Comment|Separator/;

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

function lowerComponentArg(
  argNodes: SyntaxNode[],
  ctx: LowerContext,
): PropValue {
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
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])];
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
  "LuauSparkleEventClosureAttribute",
]);
const EVENT_NAME = nodeNameSet(["EventAttributeName"]);
const EVENT_CONTENT = nodeNameSet([
  "LuauEventAttribute_content",
  "LuauSparkleEventHandler",
]);
const EVENT_HANDLER_NAME = nodeNameSet(["LuauSparkleEventHandlerName"]);
const EVENT_CLOSURE = nodeNameSet(["LuauSparkleHandlerClosure"]);
const EVENT_CLOSURE_BODY = nodeNameSet(["LuauSparkleHandlerClosure_content"]);
const EVENT_CLOSURE_END = nodeNameSet(["LuauSparkleHandlerClosure_end"]);

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

function readEvents(lineNode: SyntaxNode, ctx: LowerContext): EventBinding[] {
  const events: EventBinding[] = [];
  for (const attr of eventAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, EVENT_NAME);
    const event = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!event) continue;
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
    const refNode = firstDescendant(attr, EVENT_HANDLER_NAME);
    if (refNode) {
      events.push({
        event,
        handler: { kind: "ref", name: ctx.read(refNode.from, refNode.to).trim() },
      });
      continue;
    }
    const handlerNode = handlerContent(firstDescendant(attr, EVENT_CONTENT));
    if (handlerNode) {
      events.push({
        event,
        handler: {
          kind: "call",
          binding: lowerBinding(handlerNode, ctx, ["event"]),
        },
      });
    }
  }
  return events;
}

function handlerContent(node: SyntaxNode | null): SyntaxNode | null {
  if (node?.name === "LuauSparkleEventHandler") return node.firstChild ?? node;
  return node;
}

export const UNCLOSED_HANDLER_CLOSURE =
  "This handler is missing its closing `}`. Without it, the handler runs to the next line that starts with `end`, `else`, `elseif` or `case`, the next `scene` or `branch`, or the end of the file.";

function lowerHandlerClosure(
  closureNode: SyntaxNode,
  ctx: LowerContext,
  extraParams: string[] = [],
): Binding {
  const exprId = bindingId(closureNode.from, ctx);
  const source = ctx.read(closureNode.from, closureNode.to);
  const span = bindingSpan(closureNode.from, closureNode.to, ctx);
  const loopVars = [...new Set([...(ctx.sparkleLoopVars ?? []), ...extraParams])];
  const closeBrace = childrenByName(closureNode, EVENT_CLOSURE_END)[0];
  if ((!closeBrace || closeBrace.to === closeBrace.from) && ctx.diagnostics) {
    const open = closureNode.from;
    ctx.diagnostics.push({
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
    const shape = openEvaluatorBody(ctx, closureNode.from, closureNode.to);
    const localConsts = ctx.localConsts;
    ctx.localConsts = true;
    const closureBody = body ? closureBodyAst(body, ctx) : null;
    const { result: stmts, hoisted, nested } = inFunctionScopes(
      loopVars.map((name) => ({ name })),
      loopVars,
      closureBody,
      ctx,
      () => {
        const stmts = lowerStatements(body, ctx, undefined, shape);
        if (closureBody) reportErasedConstErrors(closureBody, closureNode, ctx);
        return stmts;
      },
    );
    ctx.localConsts = localConsts;
    if (body) reportBodySyntaxErrors(closureReadingErrors(closureSyntaxErrors(body, ctx), closureNode, documentText(ctx)), ctx);
    const fn = new Function(
      new Identifier(exprId),
      [...hoisted, ...stmts, ...nested],
      loopVars.map((n) => new Argument(new Identifier(n), false, false)),
    );
    stampDebugMetadata([fn], closureNode.from, closureNode.to, ctx);
    closeFunctionBody(ctx, shape, fn, closureNode, hoisted, true);
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
const PROP_LITERAL = nodeNameSet([
  "InlinePropNumericValue", "InlinePropBooleanValue", "InlinePropWordValue",
]);

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

function readProps(
  lineNode: SyntaxNode,
  ctx: LowerContext,
): Record<string, PropValue> {
  const props: Record<string, PropValue> = {};
  for (const attr of propAttributes(lineNode)) {
    const nameNode = firstDescendant(attr, PROP_NAME);
    const name = nameNode ? ctx.read(nameNode.from, nameNode.to).trim() : "";
    if (!name) continue;
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
        value: literal.name === "InlinePropNumericValue"
          ? Number(ctx.read(literal.from, literal.to))
          : literal.name === "InlinePropBooleanValue"
            ? ctx.read(literal.from, literal.to) === "true"
            : ctx.read(literal.from, literal.to),
      };
    }
  }
  return props;
}

function readContentParts(
  value: SyntaxNode | null,
  ctx: LowerContext,
): ContentPart[] {
  if (value && INTERP_CONTENT_NODES.has(value.name)) {
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
        isExplicitRuleName(child.name, "LuauInterpolatedStringExpression") ||
        isExplicitRuleName(child.name, "LuauFunctionCallShorthand")
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

const PLAIN_STRING_CONTENT = nodeNameSet([
  "PlainStringContent",
  "PlainStringContentSingleQuoted",
]);

function readLiteralValue(field: SyntaxNode | null, ctx: LowerContext): PropValue {
  if (!field) return { kind: "literal", value: "" };
  const value = structValueNode(field);
  if (PLAIN_CONTENT_NODES.has(value.name)) {
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

interface ElementParts {
  classes: string[];
  content?: ContentPart[];
  props: Record<string, PropValue>;
  events: EventBinding[];
}

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

function partClasses(parts: SyntaxNode[], ctx: LowerContext): string[] {
  return parts.flatMap((part) =>
    part.name === "LuauSparkleEventClosureAttribute"
      ? []
      : descendants(part, HEAD_CLASS_NAMES)
          .map((t) => ctx.read(t.from, t.to).trim())
          .filter(Boolean),
  );
}

function continuationPartNodes(key: number, ctx: LowerContext): SyntaxNode[] {
  return (ctx.sparkleJoins?.continuations.get(key) ?? []).flatMap((line) =>
    sparklePartNodes(line),
  );
}

const HEAD_CLASS_NAMES = nodeNameSet([
  "LuauSparkleClassName",
]);

function buildBracedEntries(
  container: SyntaxNode,
  ctx: LowerContext,
): { children: BodyNode[]; props: Record<string, PropValue> } {
  const children: BodyNode[] = [];
  const props: Record<string, PropValue> = {};
  for (const entry of sparkleBlockEntries(container)) {
    if (isContinuation(entry, ctx)) {
      continue;
    }
    if (entry.name === "LuauSparkleElement") {
      children.push(buildBracedElement(entry, ctx));
    } else if (entry.name === "LuauStructBlockProperty") {
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
  }
  return { children, props };
}

function buildBracedElement(node: SyntaxNode, ctx: LowerContext): BodyNode {
  const { name, args, block } = sparkleElementParts(node);
  const tag = name ? ctx.read(name.from, name.to).trim() : "";
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
const BRACED_BRANCH_CONTENT = nodeNameSet([
  "LuauSparkleBlockIf_content",
  "LuauSparkleBlockElseif_content",
  "LuauSparkleBlockElse_content",
  "LuauSparkleBlockFor_content",
  "LuauSparkleBlockCase_content",
]);

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

function lowerBindingFromNodes(nodes: SyntaxNode[], ctx: LowerContext): Binding {
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const exprId = bindingId(first.from, ctx);
  const source = ctx.read(first.from, last.to);
  const span = bindingSpan(first.from, last.to, ctx);
  const loopVars = [...new Set(ctx.sparkleLoopVars ?? [])];
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
      const parsed = parseNumericForHeader(condContent, ctx);
      if (parsed) {
        bindings = [parsed.loopVar];
        numeric = parsed.numeric;
      }
    }
  }
  const elseBlock = content ? childrenByName(content, ELSE_CLAUSE)[0] : undefined;
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

export function buildSparkleBody(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): BodyNode[] {
  const prevJoins = ctx.sparkleJoins;
  ctx.sparkleJoins = joinSparkleContinuations(contentNode);
  const prevStamp = ctx.stampExpressionSpans;
  ctx.stampExpressionSpans = true;
  try {
    return buildBodyEntries(contentNode, ctx);
  } finally {
    ctx.stampExpressionSpans = prevStamp;
    ctx.sparkleJoins = prevJoins;
  }
}
function collectForLoopTargetNames(
  condContent: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const names: string[] = [];
  for (let child = condContent.firstChild; child; child = child.nextSibling) {
    if (
      isExplicitRuleName(child.name, "LuauAssignmentOperation") ||
      child.name === "LuauInKeyword"
    ) {
      break;
    }
    if (isExplicitRuleName(child.name, "LuauAccessPath")) {
      const nameNode = getDescendent("LuauVariableName", child);
      if (nameNode) names.push(ctx.read(nameNode.from, nameNode.to));
    }
  }
  return names;
}

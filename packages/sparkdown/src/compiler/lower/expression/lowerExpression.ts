import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { LowerContext } from "../context";
import { lowerTable } from "./lowerTable";
import { mapStdLibCallToBuiltin } from "../utils/stdlibMapping";
import {
  isBuiltinMethod,
  METHOD_PREFIX,
} from "../../../inkjs/engine/StdLib";

// ============================================================================
// Public entry points
// ============================================================================

// Lower the value-expression formed by the children of `parent`. Operator
// markers that aren't part of the expression value (e.g. LuauAssignmentOperator
// before the RHS) are skipped via SKIP_NAMES.
export function lowerExpressionFromContainer(
  parent: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const tokens: Token[] = [];
  collectTokens(parent, ctx, tokens);
  return prattParse(tokens, 0);
}

// Lower an expression formed by a list of specific nodes (used for function
// call arguments where the caller has already split by commas).
export function lowerExpressionFromNodes(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  const tokens: Token[] = [];
  // Mirrors the method-call pair detection in `collectTokens`: an arg like
  // `math.ceil(1.2)` arrives here as two adjacent siblings (LuauAccessPath +
  // LuauParenthetical). Without this combining step, the access path and
  // the parenthetical would be lowered independently — the access path
  // would degrade to a VariableReference and the parenthetical would
  // attach as a separate operand, producing garbage expressions like
  // `math / 3`.
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.name === "LuauAccessPath" && hasTrailingMethodAccessor(node)) {
      const next = nodes[i + 1];
      if (next && next.name === "LuauParenthetical") {
        let expr = lowerMethodCall(node, next, ctx);
        // Chained method calls — mirror the tree-walking logic in
        // `collectTokens`. Fold subsequent
        // `LuauChainedFunctionCall + LuauParenthetical` pairs into the
        // chain, threading the previous result as the receiver.
        let j = i + 2;
        while (expr && j < nodes.length) {
          const after = nodes[j]!;
          if (isSkippableName(after.name)) {
            j++;
            continue;
          }
          if (after.name !== "LuauChainedFunctionCall") break;
          let k = j + 1;
          while (k < nodes.length && isSkippableName(nodes[k]!.name)) k++;
          const chainParen = nodes[k];
          if (!chainParen || chainParen.name !== "LuauParenthetical") break;
          expr = lowerChainedMethodCall(after, chainParen, expr, ctx);
          j = k + 1;
        }
        if (expr) tokens.push({ kind: "operand", expr });
        i = j - 1; // outer loop's i++ will land on first un-consumed node
        continue;
      }
    }
    collectFromNode(node, ctx, tokens);
  }
  return prattParse(tokens, 0);
}

// ============================================================================
// Token collection — flattens nested operation wrappers into a linear stream
// ============================================================================

type Token =
  | { kind: "operand"; expr: Expression }
  | { kind: "binop"; op: string }
  | { kind: "unop"; op: string };

const OPERATION_WRAPPERS = new Set([
  "LuauArithmeticOperation",
  "LuauCompareOperation",
  "LuauLogicalOperation",
  "LuauConcatOperation",
  "LuauLengthOperation",
]);

// Nodes whose entire subtree contributes nothing to the runtime expression —
// they're type-only annotations. The LHS expression continues unchanged.
const TYPE_ONLY_WRAPPERS = new Set([
  "LuauTypeCastOperation",
  "LuauTypeAnnotationOperation",
]);

const BINARY_OPERATOR_MARKERS = new Set([
  "LuauArithmeticOperator",
  "LuauCompareOperator",
  "LuauLogicalOperator",
  "LuauConcatOperator",
]);

const UNARY_OPERATOR_MARKERS = new Set(["LuauLengthOperator"]);

const PRIMARY_NODES = new Set([
  "LuauNumericDecimal",
  "LuauNumericHex",
  "LuauNumericBinary",
  "LuauBoolean",
  "LuauNil",
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauMultilineString",
  "LuauInterpolatedString",
  "LuauAccessPath",
  "LuauParenthetical",
  "LuauTable",
  "LuauDivertTargetLiteral",
]);

function collectTokens(
  parent: SyntaxNode,
  ctx: LowerContext,
  tokens: Token[],
): void {
  // Walk the relevant content node. begin/end rules expose their actual
  // children inside a generated `<RuleName>_content` wrapper; if present,
  // descend into it. Otherwise iterate direct children.
  const contentName = `${parent.name}_content`;
  let child = findContentChild(parent, contentName) ?? parent.firstChild;
  while (child) {
    // Method call grammar quirk: `obj:greet("hi")` parses as a
    // `LuauAccessPath` ending with `LuauFunctionAccessor` (`:greet`) followed
    // by a sibling `LuauParenthetical` holding the args — they live as
    // adjacent expression-level nodes, not inside the access path. Detect and
    // lower the pair together before falling through to single-node handling.
    if (
      child.name === "LuauAccessPath" &&
      hasTrailingMethodAccessor(child)
    ) {
      const args = findNextNonSkippableSibling(child);
      if (args?.name === "LuauParenthetical") {
        let expr = lowerMethodCall(child, args, ctx);
        // Chained method calls: after the initial `LuauAccessPath +
        // LuauParenthetical` pair, the grammar emits one or more
        // `LuauChainedFunctionCall + LuauParenthetical` pairs for each
        // chained `:method(args)` link (see grammar rule
        // `LuauChainedFunctionCall` and the comment in `LuauExpression`).
        // Each pair threads the previous result as the receiver.
        let after: SyntaxNode | null = args.nextSibling;
        while (expr && after) {
          while (after && isSkippableName(after.name)) after = after.nextSibling;
          if (!after || after.name !== "LuauChainedFunctionCall") break;
          const chainParen = findNextNonSkippableSibling(after);
          if (!chainParen || chainParen.name !== "LuauParenthetical") break;
          expr = lowerChainedMethodCall(after, chainParen, expr, ctx);
          after = chainParen.nextSibling;
        }
        if (expr) tokens.push({ kind: "operand", expr });
        child = after;
        continue;
      }
    }
    collectFromNode(child, ctx, tokens);
    child = child.nextSibling;
  }
}

// Lower a single `:method(args)` chain link given a pre-lowered receiver
// expression. The grammar represents each chain link as a
// `LuauChainedFunctionCall` (containing a `LuauFunctionAccessor`) plus a
// sibling `LuauParenthetical`. We extract the method name from the
// accessor, the args from the parenthetical, and emit a `FunctionCall`
// — either to the builtin-method dispatch name (`__method_<name>`) or
// to a user-defined function — with the receiver threaded as the first
// argument.
function lowerChainedMethodCall(
  chainNode: SyntaxNode,
  parenthetical: SyntaxNode,
  receiver: Expression,
  ctx: LowerContext,
): Expression | null {
  const accessor = getDescendent("LuauFunctionAccessor", chainNode);
  if (!accessor) return null;
  const methodNameNode = getDescendent("LuauFunctionName", accessor);
  if (!methodNameNode) return null;
  const methodNameText = ctx.read(methodNameNode.from, methodNameNode.to);
  const callArgs = lowerParentheticalArgList(parenthetical, ctx);
  if (isBuiltinMethod(methodNameText)) {
    return new FunctionCall(
      new Identifier(`${METHOD_PREFIX}${methodNameText}`),
      [receiver, ...callArgs],
    );
  }
  return new FunctionCall(new Identifier(methodNameText), [
    receiver,
    ...callArgs,
  ]);
}


function hasTrailingMethodAccessor(accessPath: SyntaxNode): boolean {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  if (!content) return false;
  let last: SyntaxNode | null = null;
  let inner = content.firstChild;
  while (inner) {
    if (inner.name === "LuauAccessPart") last = inner;
    inner = inner.nextSibling;
  }
  return last?.firstChild?.name === "LuauFunctionAccessor";
}

function findNextNonSkippableSibling(node: SyntaxNode): SyntaxNode | null {
  let next = node.nextSibling;
  while (next) {
    if (!isSkippableName(next.name)) return next;
    next = next.nextSibling;
  }
  return null;
}

// Lower `obj:method(args)` to `FunctionCall("method", [obj, ...args])`. This
// is the desugar Luau applies (the colon implicitly threads the receiver as
// the first argument), translated to ink's flat function-call namespace —
// users define `method` as a regular global function expecting the receiver
// as its first parameter.
function lowerMethodCall(
  accessPath: SyntaxNode,
  parenthetical: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  if (!content) return null;

  // Split parts into [receiver-parts..., method-accessor].
  const parts: SyntaxNode[] = [];
  let inner = content.firstChild;
  while (inner) {
    if (inner.name === "LuauAccessPart") parts.push(inner);
    inner = inner.nextSibling;
  }
  if (parts.length < 2) return null;
  const methodPart = parts[parts.length - 1]!;
  const receiverParts = parts.slice(0, -1);

  const methodAccessor = methodPart.firstChild;
  if (methodAccessor?.name !== "LuauFunctionAccessor") return null;
  const methodNameNode = getDescendent("LuauFunctionName", methodAccessor);
  if (!methodNameNode) return null;
  const methodNameText = ctx.read(methodNameNode.from, methodNameNode.to);
  const methodName = new Identifier(methodNameText);

  // Lower the parenthetical's contents as a comma-separated arg list.
  const callArgs = lowerParentheticalArgList(parenthetical, ctx);

  // Luau stdlib mapping: when the receiver is a single stdlib constant
  // (`math` / `string` / `table` / ...) AND the `<receiver>.<method>` pair
  // maps to a runtime builtin (e.g. `math.floor` → `FLOOR`), emit a direct
  // builtin call with the args alone — no receiver-threading. This lets
  // sparkdown users write `math.floor(x)` instead of ink's `FLOOR(x)` while
  // reusing the existing `NativeFunctionCall` / control-command machinery.
  // The receiver name lives under `LuauStdLibConstants` for stdlib names
  // (the `LuauVariable` rule's captures try stdlib before plain variable),
  // so we look for that descendent first.
  if (receiverParts.length === 1) {
    const onlyPart = receiverParts[0]!.firstChild;
    if (onlyPart?.name === "LuauVariable") {
      const stdlibNode =
        getDescendent("LuauStdLibConstants", onlyPart) ??
        getDescendent("LuauVariableName", onlyPart);
      if (stdlibNode) {
        const receiverName = ctx.read(stdlibNode.from, stdlibNode.to);
        const builtin = mapStdLibCallToBuiltin(
          receiverName,
          methodNameText,
          callArgs.length,
        );
        if (builtin) {
          return new FunctionCall(new Identifier(builtin), callArgs);
        }
      }
    }
  }

  // Build the receiver expression by reusing the regular access-path lowerer
  // on a synthetic parts list (no method accessor, no trailing call).
  const receiver = lowerPartsAsExpression(receiverParts, ctx);
  if (!receiver) return null;

  // Builtin method dispatch (`s:upper()`, `t:find(x)`, `t:union(other)`,
  // ...). When the method name matches a registered builtin in
  // `METHOD_DISPATCH`, emit a FunctionCall to the synthetic
  // `__method_<name>` instead of the bare method name — the runtime
  // recognizes the prefix and routes to per-receiver-type dispatch in
  // `callBuiltinMethod`. Falls through to the user-defined method-call
  // path (`FunctionCall("<method>", [receiver, ...args])`) when the
  // method name isn't a known builtin.
  if (isBuiltinMethod(methodNameText)) {
    return new FunctionCall(
      new Identifier(`${METHOD_PREFIX}${methodNameText}`),
      [receiver, ...callArgs],
    );
  }

  return new FunctionCall(methodName, [receiver, ...callArgs]);
}

function lowerPartsAsExpression(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  // Reuse the existing chain builder by routing through the same predicates
  // `lowerAccessPath` uses.
  const needsValueChain = parts.some((p, i) => {
    const k = p.firstChild?.name;
    if (k === "LuauPropertyIndexer") return true;
    if (k === "LuauFunctionCall" && (i > 0 || parts.length > 1)) return true;
    return false;
  });
  return needsValueChain
    ? lowerValueChainAccessPath(parts, ctx)
    : lowerSimpleAccessPath(parts, ctx);
}

function lowerParentheticalArgList(
  parenthetical: SyntaxNode,
  ctx: LowerContext,
): Expression[] {
  const content = findChildByName(parenthetical, "LuauParenthetical_content");
  if (!content) return [];
  const args: Expression[] = [];
  let group: SyntaxNode[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const expr = lowerExpressionFromNodes(group, ctx);
    if (expr) args.push(expr);
    group = [];
  };
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauCommaSeparator") {
      flush();
    } else if (!isSkippableName(child.name)) {
      group.push(child);
    }
    child = child.nextSibling;
  }
  flush();
  return args;
}

function findContentChild(
  parent: SyntaxNode,
  contentName: string,
): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === contentName) {
      return child.firstChild;
    }
    child = child.nextSibling;
  }
  return null;
}

function collectFromNode(
  node: SyntaxNode,
  ctx: LowerContext,
  tokens: Token[],
): void {
  const name = node.name;
  if (TYPE_ONLY_WRAPPERS.has(name)) {
    // Type-only constructs (`a :: SomeType`, `local x: number = ...`) don't
    // affect runtime behavior — skip the entire subtree.
    return;
  }
  if (OPERATION_WRAPPERS.has(name)) {
    // Recurse into the operation wrapper — its children become part of the
    // outer token stream.
    collectTokens(node, ctx, tokens);
    return;
  }
  if (PRIMARY_NODES.has(name)) {
    const expr = lowerPrimary(node, ctx);
    if (expr) {
      tokens.push({ kind: "operand", expr });
    }
    return;
  }
  if (BINARY_OPERATOR_MARKERS.has(name)) {
    const op = readOperatorText(node, ctx);
    if (op) tokens.push({ kind: "binop", op });
    return;
  }
  if (UNARY_OPERATOR_MARKERS.has(name)) {
    // `#` is prefix-only; emit as unary
    const op = readOperatorText(node, ctx) ?? "#";
    tokens.push({ kind: "unop", op });
    return;
  }
  // Everything else (whitespace, comments, separators, assignment operators,
  // type annotations, etc.) is skipped.
}

function readOperatorText(node: SyntaxNode, ctx: LowerContext): string | null {
  // Operator marker nodes wrap their text with optional surrounding
  // whitespace captured by their begin pattern (e.g.
  // `({{WS}}*)({{LUAU_ARITHMETIC_OPERATORS}})({{WS}}*)`). Trimming the
  // whole node's text reliably yields just the operator string —
  // there's nothing inside an operator marker but optional whitespace +
  // the op + optional whitespace.
  return ctx.read(node.from, node.to).trim();
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

// ============================================================================
// Pratt parser
// ============================================================================

// Luau binary operator precedence (higher binds tighter).
const BINOP_PRECEDENCE: { [op: string]: { prec: number; rightAssoc: boolean } } =
  {
    or: { prec: 1, rightAssoc: false },
    and: { prec: 2, rightAssoc: false },
    "<": { prec: 3, rightAssoc: false },
    ">": { prec: 3, rightAssoc: false },
    "<=": { prec: 3, rightAssoc: false },
    ">=": { prec: 3, rightAssoc: false },
    "==": { prec: 3, rightAssoc: false },
    "~=": { prec: 3, rightAssoc: false },
    "..": { prec: 4, rightAssoc: true },
    "+": { prec: 5, rightAssoc: false },
    "-": { prec: 5, rightAssoc: false },
    "*": { prec: 6, rightAssoc: false },
    "/": { prec: 6, rightAssoc: false },
    "//": { prec: 6, rightAssoc: false },
    "%": { prec: 6, rightAssoc: false },
    "^": { prec: 8, rightAssoc: true },
  };

const UNARY_PRECEDENCE = 7;

class TokenStream {
  pos = 0;
  constructor(public readonly tokens: Token[]) {}
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }
}

function prattParse(tokens: Token[], minPrec: number): Expression | null {
  if (tokens.length === 0) return null;
  const stream = new TokenStream(tokens);
  return parsePrec(stream, minPrec);
}

function parsePrec(stream: TokenStream, minPrec: number): Expression | null {
  let left = parseUnaryOrPrimary(stream);
  if (!left) return null;

  while (true) {
    const next = stream.peek();
    if (!next || next.kind !== "binop") break;
    const info = BINOP_PRECEDENCE[next.op];
    if (!info || info.prec < minPrec) break;
    stream.consume();
    const nextMin = info.rightAssoc ? info.prec : info.prec + 1;
    const right = parsePrec(stream, nextMin);
    if (!right) break;
    left = new BinaryExpression(left, right, next.op);
  }
  return left;
}

function parseUnaryOrPrimary(stream: TokenStream): Expression | null {
  const next = stream.peek();
  if (!next) return null;
  if (next.kind === "unop") {
    stream.consume();
    const operand = parsePrec(stream, UNARY_PRECEDENCE);
    if (!operand) return null;
    return UnaryExpression.WithInner(operand, next.op);
  }
  if (next.kind === "binop") {
    // A binop at the start of an expression — treat as a prefix unary if it's
    // one of the supported unary operators (`-`, `not`).
    if (next.op === "-" || next.op === "not") {
      stream.consume();
      const operand = parsePrec(stream, UNARY_PRECEDENCE);
      if (!operand) return null;
      return UnaryExpression.WithInner(operand, next.op);
    }
    return null;
  }
  // operand
  stream.consume();
  return next.expr;
}

// ============================================================================
// Primary lowering
// ============================================================================

export function lowerPrimary(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  switch (node.name) {
    case "LuauNumericDecimal":
      return lowerDecimalNumber(node, ctx);
    case "LuauNumericHex":
      return lowerHexNumber(node, ctx);
    case "LuauNumericBinary":
      return lowerBinaryNumber(node, ctx);
    case "LuauBoolean":
      return lowerBoolean(node, ctx);
    case "LuauNil":
      // Sparkdown has no first-class nil — represent it as integer zero, which
      // is falsy in ink and round-trips through comparisons (`x == nil` becomes
      // `x == 0`). This mirrors the rest of the runtime's "absent ≡ falsy"
      // convention; a dedicated `NilValue` type can be added later if user code
      // needs to distinguish nil from numeric zero.
      return new NumberExpression(0, "int");
    case "LuauDoubleQuotedString":
    case "LuauSingleQuotedString":
    case "LuauMultilineString":
    case "LuauInterpolatedString":
      return lowerString(node, ctx);
    case "LuauAccessPath":
      return lowerAccessPath(node, ctx);
    case "LuauParenthetical":
      return lowerExpressionFromContainer(node, ctx);
    case "LuauTable":
      return lowerTable(node, ctx);
    case "LuauDivertTargetLiteral":
      return lowerDivertTargetLiteral(node, ctx);
    default:
      return null;
  }
}

function lowerDivertTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression {
  // `-> name(.path)*` → `DivertTarget(Divert([Identifier(name), ...]))`.
  // inkjs's `DivertTarget` Expression wraps the Divert and generates
  // a runtime `DivertTargetValue` that can be stored in variables,
  // compared with `==`, or re-diverted-to via `-> x`.
  // The path lives inside the `DivertPath` named wrapper (§6.4: we
  // address captures by name, not by `_cN` index). `DivertPath` is a
  // descendant of `LuauDivertTargetLiteral` (one level deep via the
  // capture's auto-generated `_cN` wrapper), so use `getDescendent`.
  const parts: Identifier[] = [];
  const pathNode = getDescendent("DivertPath", node);
  if (pathNode) {
    const stack: SyntaxNode[] = [pathNode];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (n.name === "DivertPartName") {
        parts.push(new Identifier(ctx.read(n.from, n.to)));
      } else {
        let c = n.firstChild;
        while (c) {
          stack.push(c);
          c = c.nextSibling;
        }
      }
    }
  }
  const divert = new Divert(parts);
  return new DivertTarget(divert);
}

function readNumericText(node: SyntaxNode, ctx: LowerContext): string {
  const first = node.firstChild;
  const raw = first ? ctx.read(first.from, first.to) : ctx.read(node.from, node.to);
  return raw.replace(/_/g, "");
}

function lowerDecimalNumber(node: SyntaxNode, ctx: LowerContext): Expression {
  const text = readNumericText(node, ctx);
  const isFloat = text.includes(".") || /[eE]/.test(text);
  return new NumberExpression(Number(text), isFloat ? "float" : "int");
}

function lowerHexNumber(node: SyntaxNode, ctx: LowerContext): Expression {
  const text = readNumericText(node, ctx);
  return new NumberExpression(Number(text), "int");
}

function lowerBinaryNumber(node: SyntaxNode, ctx: LowerContext): Expression {
  const text = readNumericText(node, ctx);
  const m = text.match(/^0[bB]([01]+)/);
  const value = m ? parseInt(m[1]!, 2) : Number(text);
  return new NumberExpression(value, "int");
}

function lowerBoolean(node: SyntaxNode, ctx: LowerContext): Expression {
  return new NumberExpression(
    ctx.read(node.from, node.to).trim().startsWith("true"),
    "bool",
  );
}

function lowerString(node: SyntaxNode, ctx: LowerContext): Expression {
  if (node.name === "LuauInterpolatedString") {
    return lowerInterpolatedString(node, ctx);
  }
  // The grammar's LuauDoubleQuotedString / LuauSingleQuotedString rules
  // capture trailing whitespace as part of their end pattern (via the
  // LUAU_BINARY_OPERATOR_AHEAD lookahead-with-WS-capture), so `node.from
  // ..node.to` may extend past the closing quote into the surrounding
  // whitespace. Trim before stripping quotes so the leading-and-trailing
  // quote check actually fires on the literal's real boundaries.
  const text = ctx.read(node.from, node.to).trim();
  return new StringExpression([new Text(stripQuotes(text))]);
}

// Backtick string interpolation: walk the content children, accumulating Text
// for literal segments and lowering each `{...}` expression into the
// StringExpression's content list. The runtime's BeginString..EndString frame
// emitted by StringExpression handles concatenation; each inner Expression
// outputs its value into the open string slot.
function lowerInterpolatedString(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression {
  const content = findChildByName(node, "LuauInterpolatedString_content");
  if (!content) return new StringExpression([new Text("")]);
  const parts: ParsedObject[] = [];
  let textBuf = "";
  const flush = () => {
    if (textBuf.length > 0) {
      parts.push(new Text(textBuf));
      textBuf = "";
    }
  };
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauInterpolatedStringExpression") {
      flush();
      const expr = lowerExpressionFromContainer(child, ctx);
      if (expr) {
        expr.outputWhenComplete = true;
        parts.push(expr);
      }
    } else {
      textBuf += ctx.read(child.from, child.to);
    }
    child = child.nextSibling;
  }
  flush();
  if (parts.length === 0) parts.push(new Text(""));
  return new StringExpression(parts);
}

function stripQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  ) {
    return text.slice(1, -1);
  }
  if (first === "[") {
    const m = text.match(/^\[(=*)\[([\s\S]*?)\]\1\]$/);
    if (m) return m[2]!;
  }
  return text;
}

function lowerAccessPath(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const parts: SyntaxNode[] = [];
  const content = findChildByName(node, "LuauAccessPath_content");
  if (content) {
    let inner = content.firstChild;
    while (inner) {
      if (inner.name === "LuauAccessPart") parts.push(inner);
      inner = inner.nextSibling;
    }
  }
  if (parts.length === 0) return null;

  // A path is "simple" when it's a bare dotted identifier chain (`a.b.c`),
  // which lowers to a single `VariableReference` so ink's hierarchical name
  // resolution (knot/stitch lookup, function parameters, etc.) keeps working.
  // Anything with a `[key]` indexer or a mid-chain function call switches to
  // a value-oriented chain — `IndexExpression` over an initial
  // `VariableReference` or `FunctionCall` base.
  const needsValueChain = parts.some((p, i) => {
    const k = p.firstChild?.name;
    if (k === "LuauPropertyIndexer") return true;
    // A function call needs the value chain if it has anything trailing it
    // (`f(x).y`, `f(x)[k]`) or if it's mid-chain. A bare `f(x)` with no
    // trailing parts stays as a plain `FunctionCall`.
    if (k === "LuauFunctionCall" && (i > 0 || parts.length > 1)) return true;
    return false;
  });

  if (needsValueChain) {
    return lowerValueChainAccessPath(parts, ctx);
  }

  return lowerSimpleAccessPath(parts, ctx);
}

// Pure dotted/identifier chain → `VariableReference([a,b,c,...])`, or a
// leading function call → `FunctionCall(name, args)`. Used when no `[key]`
// indexer or mid-chain call forces value-oriented indexing.
export function lowerSimpleAccessPath(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  const identifiers: Identifier[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const inner = part.firstChild;
    if (!inner) continue;
    switch (inner.name) {
      case "LuauVariable": {
        const nameNode = getDescendent("LuauVariableName", inner);
        if (nameNode) {
          identifiers.push(
            new Identifier(ctx.read(nameNode.from, nameNode.to)),
          );
        }
        break;
      }
      case "LuauPropertyAccessor": {
        const nameNode = getDescendent("LuauPropertyName", inner);
        if (nameNode) {
          identifiers.push(
            new Identifier(ctx.read(nameNode.from, nameNode.to)),
          );
        }
        break;
      }
      case "LuauFunctionCall": {
        if (i === 0) {
          const nameNode = getDescendent("LuauFunctionName", inner);
          const name = nameNode
            ? new Identifier(ctx.read(nameNode.from, nameNode.to))
            : null;
          const args = lowerCallArguments(inner, ctx);
          if (name) return new FunctionCall(name, args);
        }
        break;
      }
      default:
        // LuauFunctionAccessor (method call) deferred.
        break;
    }
  }

  if (identifiers.length > 0) {
    return new VariableReference(identifiers);
  }
  return null;
}

// Build an `IndexExpression` chain for paths that include `[key]` indexers
// OR a function call followed by further access. The leading base is either:
//   - a `VariableReference` (when the path starts with one or more dotted
//     identifier parts), or
//   - a `FunctionCall` (when the path starts with `f(args)`).
// Each subsequent part wraps the running expression in an `IndexExpression`.
// Dot-property segments after the base fold to string-key index ops since the
// base is now a value, not a namespace.
export function lowerValueChainAccessPath(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  let current: Expression | null = null;
  let i = 0;

  const firstInner = parts[0]?.firstChild;
  if (firstInner?.name === "LuauFunctionCall") {
    const nameNode = getDescendent("LuauFunctionName", firstInner);
    if (!nameNode) return null;
    const name = new Identifier(ctx.read(nameNode.from, nameNode.to));
    const args = lowerCallArguments(firstInner, ctx);
    current = new FunctionCall(name, args);
    i = 1;
  } else {
    // Gather the leading dot-path identifier run as the initial
    // VariableReference base.
    const leading: Identifier[] = [];
    for (; i < parts.length; i++) {
      const inner = parts[i]!.firstChild;
      if (!inner) continue;
      if (inner.name === "LuauVariable") {
        const nameNode = getDescendent("LuauVariableName", inner);
        if (nameNode) {
          leading.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
        }
        continue;
      }
      if (inner.name === "LuauPropertyAccessor") {
        const nameNode = getDescendent("LuauPropertyName", inner);
        if (nameNode) {
          leading.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
        }
        continue;
      }
      break;
    }
    if (leading.length === 0) return null;
    current = new VariableReference(leading);
  }

  for (; i < parts.length; i++) {
    const inner = parts[i]!.firstChild;
    if (!inner) continue;
    if (inner.name === "LuauPropertyIndexer") {
      const keyContent = findChildByName(inner, "LuauPropertyIndexer_content");
      const key = keyContent
        ? lowerExpressionFromContainer(keyContent, ctx)
        : null;
      if (!key) return null;
      current = new IndexExpression(current, key);
      continue;
    }
    if (inner.name === "LuauPropertyAccessor") {
      const nameNode = getDescendent("LuauPropertyName", inner);
      if (!nameNode) return null;
      const key = new StringExpression([
        new Text(ctx.read(nameNode.from, nameNode.to)),
      ]);
      current = new IndexExpression(current, key);
      continue;
    }
    // Chained function call (`f(x)(y)`) and method accessor (`obj:m`)
    // mid-chain — still deferred.
    return null;
  }
  return current;
}

function lowerCallArguments(
  callNode: SyntaxNode,
  ctx: LowerContext,
): Expression[] {
  const params = getDescendent("LuauFunctionCallParameters", callNode);
  if (!params) return [];
  const content = findChildByName(params, "LuauFunctionCallParameters_content");
  if (!content) return [];

  const args: Expression[] = [];
  let group: SyntaxNode[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const expr = lowerExpressionFromNodes(group, ctx);
    if (expr) args.push(expr);
    group = [];
  };
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauCommaSeparator") {
      flush();
    } else if (!isSkippableName(child.name)) {
      group.push(child);
    }
    child = child.nextSibling;
  }
  flush();
  return args;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}

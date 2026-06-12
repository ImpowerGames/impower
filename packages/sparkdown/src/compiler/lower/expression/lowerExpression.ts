import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { SingleValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/SingleValueExpression";
import { StashAndRereadExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StashAndRereadExpression";
import {
  TernaryExpression,
  TernaryBranch,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/TernaryExpression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { VariablePointerExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/VariablePointerExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { LowerContext, SiblingSubFlowInfo } from "../context";
import { lowerStatements } from "../lower";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments, VARARGS_LOCAL_NAME } from "../utils/lowerArguments";
import { lowerTable } from "./lowerTable";
import { mapStdLibCallToBuiltin } from "../utils/stdlibMapping";
import { validateStdLibDeprecation } from "../utils/validateStdLibDeprecation";
import {
  isBuiltinMethod,
  lookupGlobalStdLibBuiltin,
  lookupStdLibConstant,
  METHOD_PREFIX,
} from "../../../inkjs/engine/StdLib";

// Wrap the lowerer's `new FunctionCall(name, args)` site so that
// bare (unnamespaced) source names registered in `STDLIB`
// (StdLib.ts) get arg-normalized (e.g. `assert(cond)` is padded
// with a default message) before construction. The source name is
// preserved verbatim — the registry uses the lowercase Luau-style
// name as both lookup key and runtime identifier. Adding a new
// state-aware builtin is one entry in `STDLIB`; if it needs
// arg-normalization (defaulting, padding) the special case lives
// here.
function makeGlobalFunctionCall(
  name: Identifier,
  args: Expression[],
  callNode?: SyntaxNode,
  ctx?: LowerContext,
): FunctionCall {
  const resolved = lookupGlobalStdLibBuiltin(name.name, args.length);
  if (!resolved) return new FunctionCall(name, args);
  // Editor-side strikethrough for deprecated stdlib calls (e.g.
  // `unpack(t)`). Runtime still dispatches normally; the diagnostic
  // is purely a hint. Caller may omit `callNode`/`ctx` from synthetic
  // call sites where source-mapping isn't meaningful.
  if (callNode && ctx) {
    validateStdLibDeprecation(resolved, callNode, ctx);
  }
  return new FunctionCall(new Identifier(resolved), args);
}

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
        // chain, threading the previous result as the receiver, and
        // `LuauChainedPropertyAccess` links (`a:m(x).y` / `[i]`) as
        // IndexExpressions on the running value.
        let j = i + 2;
        while (expr && j < nodes.length) {
          const after = nodes[j]!;
          if (isSkippableName(after.name)) {
            j++;
            continue;
          }
          if (after.name === "LuauChainedPropertyAccess") {
            expr = lowerChainedPropertyLink(after, expr, ctx);
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
    // IIFE / value-call on a parenthesized expression in arg context:
    // `(function() return X end)()` and `(expr)(args)` appear as two
    // adjacent LuauParenthetical siblings inside a function-call's
    // arg list. Mirror `collectTokens`'s post-operand fold so the
    // shape works inside `assert(IIFE() == X)`, `f(IIFE())`, and
    // similar call-position uses. Without this, the pratt parser
    // saw two adjacent operands inside the arg expression and
    // emitted broken bytecode (the closure leaked as a divert
    // target into the assertion, hitting `Can't cast` at runtime).
    const last = tokens[tokens.length - 1];
    if (last?.kind === "operand") {
      let j = i + 1;
      while (j < nodes.length) {
        if (isSkippableName(nodes[j]!.name)) { j++; continue; }
        // Trailing property/index links — mirror collectTokens
        // (`({f()})[1]` in arg context).
        if (nodes[j]!.name === "LuauChainedPropertyAccess") {
          const linked = lowerChainedPropertyLink(nodes[j]!, last.expr, ctx);
          if (!linked) break;
          last.expr = linked;
          i = j;
          j++;
          continue;
        }
        // Method call on the running value in arg context —
        // `assert(("ab"):rep(3) == "ababab")`. Mirror collectTokens.
        if (nodes[j]!.name === "LuauChainedFunctionCall") {
          let k = j + 1;
          while (k < nodes.length && isSkippableName(nodes[k]!.name)) k++;
          const chainParen = nodes[k];
          if (!chainParen || chainParen.name !== "LuauParenthetical") break;
          const chained = lowerChainedMethodCall(
            nodes[j]!,
            chainParen,
            last.expr,
            ctx,
          );
          if (!chained) break;
          last.expr = chained;
          i = k;
          j = k + 1;
          continue;
        }
        if (nodes[j]!.name !== "LuauParenthetical") break;
        const args = lowerParentheticalArgList(nodes[j]!, ctx);
        last.expr = new CallValueExpression(last.expr, args);
        i = j;
        j++;
      }
    }
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
  // Anonymous function literal: `function(x) return x * 2 end` as an
  // expression. The grammar's `LuauFunctionDefinition` rule covers
  // both named and anonymous forms — the lowerer routes named
  // definitions through `lowerLuauFunctionDefinition` (top-level
  // statement) and anonymous ones through `lowerAnonymousFunction`
  // (here) which synthesizes a uniquely-named hoisted knot.
  "LuauFunctionDefinition",
  // Luau's `if cond then a else b` expression form — lowered to a
  // `TernaryExpression` (conditional-evaluation jumps, see
  // lowerTernaryExpression below).
  "LuauTernaryExpression",
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
        // `LuauChainedPropertyAccess` links (`a:m(x).y` / `[i]`) fold
        // as IndexExpressions on the running value and may interleave
        // with further chained calls (`a:m(x).y[i]:n()`).
        let after: SyntaxNode | null = args.nextSibling;
        while (expr && after) {
          while (after && isSkippableName(after.name)) after = after.nextSibling;
          if (!after) break;
          if (after.name === "LuauChainedPropertyAccess") {
            expr = lowerChainedPropertyLink(after, expr, ctx);
            after = after.nextSibling;
            continue;
          }
          if (after.name !== "LuauChainedFunctionCall") break;
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
    // Value-call on a parenthesized expression: `(expr)(args)`,
    // including the IIFE shape `(function() ... end)(args)`. The
    // grammar emits both as a `LuauParenthetical` followed by another
    // `LuauParenthetical` sibling (with no operator between, since
    // operator rules like `LuauArithmeticOperation` would have
    // consumed the operator + RHS together). The pratt parser can't
    // handle two adjacent operands, so we fold the trailing
    // parenthetical as a value-call here. Subsequent `(args)`
    // siblings chain in the same way (`(expr)(a)(b)`).
    const last = tokens[tokens.length - 1];
    if (last?.kind === "operand") {
      let after: SyntaxNode | null = child.nextSibling;
      while (after) {
        while (after && isSkippableName(after.name)) after = after.nextSibling;
        if (!after) break;
        // Trailing property/index links on the running value:
        // `({f()})[1]` parses as LuauParenthetical +
        // LuauChainedPropertyAccess siblings (closure.luau line 85).
        if (after.name === "LuauChainedPropertyAccess") {
          const linked = lowerChainedPropertyLink(after, last.expr, ctx);
          if (!linked) break;
          last.expr = linked;
          child = after;
          after = after.nextSibling;
          continue;
        }
        // Method call on the running value: `("ab"):rep(3)` parses as
        // LuauParenthetical + LuauChainedFunctionCall + LuauParenthetical
        // siblings (same chain-link shape as `a:m(x):n(y)` tails).
        if (after.name === "LuauChainedFunctionCall") {
          const chainParen = findNextNonSkippableSibling(after);
          if (!chainParen || chainParen.name !== "LuauParenthetical") break;
          const chained = lowerChainedMethodCall(
            after,
            chainParen,
            last.expr,
            ctx,
          );
          if (!chained) break;
          last.expr = chained;
          child = chainParen;
          after = chainParen.nextSibling;
          continue;
        }
        if (after.name !== "LuauParenthetical") break;
        const args = lowerParentheticalArgList(after, ctx);
        last.expr = new CallValueExpression(last.expr, args);
        child = after;
        after = after.nextSibling;
      }
    }
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
  // User-defined method on a chained-call receiver — same value-call
  // dispatch as the top-level method-call case. The colon form needs
  // the receiver twice (lookup + threaded `self`), and here the
  // receiver IS the previous call's result — re-generating it would
  // re-run the call (`a:add(10):add(20)` ran `add(10)` twice and
  // produced 40 instead of 30). Stash once, read twice.
  const opNode = getDescendent("LuauAccessorOperator", accessor);
  const opText = opNode ? ctx.read(opNode.from, opNode.to).trim() : ":";
  const isColonForm = opText === ":";
  if (isColonForm) {
    const tempName = `__mcall_${chainNode.from}`;
    const targetExpr = new IndexExpression(
      new VariableReference([new Identifier(tempName)]),
      new StringExpression([new Text(methodNameText)]),
    );
    return new CallValueExpression(targetExpr, [
      new StashAndRereadExpression(receiver, tempName),
      ...callArgs,
    ]);
  }
  const targetExpr = new IndexExpression(
    receiver,
    new StringExpression([new Text(methodNameText)]),
  );
  return new CallValueExpression(targetExpr, callArgs);
}

// Fold one `LuauChainedPropertyAccess` link (`.name` or `[expr]`
// trailing a method call — `a:m(x).y`) into an IndexExpression on the
// running chain value.
function lowerChainedPropertyLink(
  linkNode: SyntaxNode,
  receiver: Expression,
  ctx: LowerContext,
): Expression | null {
  const content =
    findChildByName(linkNode, "LuauChainedPropertyAccess_content") ?? linkNode;
  const accessor = getDescendent("LuauPropertyAccessor", content);
  if (accessor) {
    const nameNode =
      getDescendent("LuauPropertyName", accessor) ??
      getDescendent("LuauStdLibMethods", accessor);
    if (!nameNode) return null;
    return new IndexExpression(
      receiver,
      new StringExpression([new Text(ctx.read(nameNode.from, nameNode.to))]),
    );
  }
  const indexer = getDescendent("LuauPropertyIndexer", content);
  if (indexer) {
    const indexerContent = findChildByName(
      indexer,
      "LuauPropertyIndexer_content",
    );
    const key = indexerContent
      ? lowerExpressionFromContainer(indexerContent, ctx)
      : null;
    if (!key) return null;
    return new IndexExpression(receiver, key);
  }
  return null;
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
          // Editor-side strikethrough for deprecated stdlib calls
          // (e.g. `table.getn(t)`, `math.pow(a, b)`). Runtime still
          // dispatches normally; the diagnostic is purely a hint.
          validateStdLibDeprecation(builtin, accessPath, ctx);
          const call = new FunctionCall(new Identifier(builtin), callArgs);
          // `count.visited(-> t)` — boolean shorthand: wrap the
          // READ_COUNT call in `> 0` so authors get a genuine boolean
          // ("has the reader been here?") instead of a count. The
          // explicit form replaces the old ink idiom of relying on
          // 0-falsy read counts, which Lua truthiness removed.
          if (receiverName === "count" && methodNameText === "visited") {
            return new BinaryExpression(
              call,
              new NumberExpression(0, "int"),
              ">",
            );
          }
          return call;
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
  // `callBuiltinMethod`.
  if (isBuiltinMethod(methodNameText)) {
    return new FunctionCall(
      new Identifier(`${METHOD_PREFIX}${methodNameText}`),
      [receiver, ...callArgs],
    );
  }

  // User-defined method on an arbitrary value (the receiver isn't a
  // stdlib namespace, and the method isn't a registered builtin). The
  // method value lives at `receiver.<name>` as a table key (closure or
  // DivertTargetValue). We can't statically resolve to a top-level
  // flow named `<name>`, so emit a value-call: evaluate the
  // IndexExpression `receiver[<name>]` and dispatch via
  // `CallValueAsFunction`. Works for both `:method(args)` (colon,
  // receiver threaded as first arg) and `.method(args)` (dot, no
  // receiver-thread) — operator detection determines arg shape below.
  //
  // Determine `.` vs `:` by reading the accessor-operator text.
  const opNode = getDescendent("LuauAccessorOperator", methodAccessor);
  const opText = opNode ? ctx.read(opNode.from, opNode.to).trim() : ":";
  const isColonForm = opText === ":";

  // Colon form needs the receiver TWICE (method lookup + threaded
  // `self` arg) but Lua evaluates it exactly ONCE. Stash it in a
  // temp via the first generated arg (CallValueExpression generates
  // args before the target), and read the temp for the index lookup
  // — `a:add(10):add(20)` must not run `add(10)` twice (calls.luau
  // line 47). The dot form uses the receiver only in the lookup, so
  // it generates directly.
  if (isColonForm) {
    const tempName = `__mcall_${accessPath.from}`;
    const targetExpr = new IndexExpression(
      new VariableReference([new Identifier(tempName)]),
      new StringExpression([new Text(methodNameText)]),
    );
    return new CallValueExpression(targetExpr, [
      new StashAndRereadExpression(receiver, tempName),
      ...callArgs,
    ]);
  }
  const targetExpr = new IndexExpression(
    receiver,
    new StringExpression([new Text(methodNameText)]),
  );
  return new CallValueExpression(targetExpr, callArgs);
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
  if (name === "LuauUnitKeywords") {
    // `...` in expression position reads the synthetic varargs local
    // (`__varargs__`) bound at function entry. The local holds a
    // `MultiValue`; receiving contexts handle spread vs truncate via
    // existing `PackTuple` / `UnpackTuple` semantics. See
    // `lowerArguments.ts` for the synthetic-binding shape.
    tokens.push({
      kind: "operand",
      expr: new VariableReference([new Identifier(VARARGS_LOCAL_NAME)]),
    });
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
      // First-class nil — emits a runtime `NullValue` with its own
      // `ValueType.Null`. Falsy in conditionals and equality-distinct
      // from `0` (`nil == 0` is false). The equality semantics are
      // implemented as a special case in `NativeFunctionCall.Call`.
      return new NullExpression();
    case "LuauDoubleQuotedString":
    case "LuauSingleQuotedString":
    case "LuauMultilineString":
    case "LuauInterpolatedString":
      return lowerString(node, ctx);
    case "LuauAccessPath":
      return lowerAccessPath(node, ctx);
    case "LuauParenthetical": {
      // Lua adjusts `(expr)` to exactly ONE value — a parenthesized
      // multi-return call truncates (`(ret2(f()))` is one value,
      // calls.luau line 210). Only potentially-multi-valued inners
      // need the runtime adjustment op; literals/operators/etc. are
      // single-valued by construction and pass through unwrapped
      // (keeps `(42)` structurally identical to `42`).
      const inner = lowerExpressionFromContainer(node, ctx);
      if (!inner) return inner;
      const maybeMultiValued =
        inner instanceof FunctionCall ||
        inner instanceof CallValueExpression ||
        inner instanceof TernaryExpression ||
        (inner instanceof VariableReference &&
          inner.name === VARARGS_LOCAL_NAME);
      return maybeMultiValued ? new SingleValueExpression(inner) : inner;
    }
    case "LuauTable":
      return lowerTable(node, ctx);
    case "LuauDivertTargetLiteral":
      return lowerDivertTargetLiteral(node, ctx);
    case "LuauFunctionDefinition":
      return lowerAnonymousFunction(node, ctx);
    case "LuauTernaryExpression":
      return lowerTernaryExpression(node, ctx);
    default:
      return null;
  }
}

// Lower Luau's `if cond then a elseif cond2 then b else c` EXPRESSION
// into a `TernaryExpression`. The grammar parses the clauses as
// children of `LuauTernaryExpression` (same shape the interpolation
// display path walks in lowerDisplay.ts):
//
//   LuauTernaryExpression
//     ├ LuauTernaryExpressionCondition   (first if-cond)
//     ├ LuauThenExpression               (`then <value1>`)
//     ├ LuauElseifKeyword (×N)           → next cond follows
//     ├ LuauTernaryExpressionCondition   (elseif-cond)
//     ├ LuauThenExpression               (`then <valueN>`)
//     └ LuauElseExpression?              (`else <value>`)
//
// Each branch value is itself a full expression (calls, nested
// ternaries via `else if`, binary ops), lowered from the clause's
// body nodes. Conditional evaluation is handled at runtime by the
// generated jump layout — see TernaryExpression.
function lowerTernaryExpression(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const content = findChildByName(node, "LuauTernaryExpression_content") ?? node;

  const isWhitespaceName = (name: string): boolean =>
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "Newline";

  // Body nodes of a then/else clause: everything inside its `_content`
  // wrapper except the `then`/`else` operator and whitespace.
  const collectClauseBody = (clause: SyntaxNode): SyntaxNode[] => {
    const body: SyntaxNode[] = [];
    const clauseContent =
      findChildByName(clause, `${clause.name}_content`) ?? clause;
    let bodyChild = clauseContent.firstChild;
    while (bodyChild) {
      if (
        bodyChild.name !== "LuauThenOperator" &&
        bodyChild.name !== "LuauElseOperator" &&
        !isWhitespaceName(bodyChild.name)
      ) {
        body.push(bodyChild);
      }
      bodyChild = bodyChild.nextSibling;
    }
    return body;
  };

  const branches: TernaryBranch[] = [];
  let pendingCond: Expression | null = null;
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauTernaryExpressionCondition") {
      const condContent =
        getDescendent("LuauTernaryExpressionCondition_content", child) ?? child;
      pendingCond = lowerExpressionFromContainer(condContent, ctx);
      if (!pendingCond) return null;
    } else if (child.name === "LuauThenExpression") {
      const value = lowerExpressionFromNodes(collectClauseBody(child), ctx);
      if (!value) return null;
      // Unparenthesized ternary-in-condition (`if if C then a else b
      // then x else y`): the grammar can't bracket the inner ternary
      // (no counting), so its clause list comes out FLAT — the
      // already-complete chain (ending in an else branch) followed by
      // extra then/else clauses. Those extras belong to the ENCLOSING
      // level: fold the completed chain into a nested
      // TernaryExpression and use it as this clause's condition.
      if (
        pendingCond === null &&
        branches.length > 0 &&
        branches[branches.length - 1]!.condition === null
      ) {
        pendingCond = new TernaryExpression(branches.splice(0));
      }
      branches.push({ condition: pendingCond, value });
      pendingCond = null;
    } else if (child.name === "LuauElseExpression") {
      const value = lowerExpressionFromNodes(collectClauseBody(child), ctx);
      if (!value) return null;
      branches.push({ condition: null, value });
    }
    child = child.nextSibling;
  }

  if (branches.length === 0) {
    // No then/else clauses of our own: the condition swallowed the
    // entire clause chain (the outer node of the flat nested-ternary
    // mis-parse above). The folded condition IS the expression.
    return pendingCond;
  }
  if (branches[0]!.condition === null) return null;
  return new TernaryExpression(branches);
}

// Lower an anonymous function literal (`function(x) return x * 2 end`)
// in expression position. Synthesizes a uniquely-named knot from the
// function's body, stashes the knot in `ctx.hoistedKnots` so the
// top-level compile pipeline can append it to the story's flow-base
// list, and returns a `DivertTarget` expression that resolves to the
// synthetic knot. The same runtime path already exists for `-> name`
// literals + `CallValueAsFunction` — anonymous-function values just
// piggyback on it.
//
// Limitations:
//   - No upvalue capture (closures). A `function() return x end` that
//     references an enclosing-scope `x` will fail to resolve at
//     runtime because the synthetic knot has no link to its lexical
//     surroundings.
//   - Named function definitions (`function name(...) ... end`) are
//     handled by `lowerLuauFunctionDefinition` at statement level
//     and never reach this path.
function lowerAnonymousFunction(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  if (!ctx.hoistedKnots && !ctx.functionScopeStack) {
    // Snapshot-only callers that don't wire up either hoist target
    // can't support anonymous functions at runtime. Fall back to null
    // so the surrounding expression-lowering machinery skips this
    // primary cleanly.
    return null;
  }
  // Skip named definitions — those are statement-level. Scope the check
  // to this node's OWN header (not deep descendants); otherwise an
  // anonymous outer fn containing a nested `local function NAME ... end`
  // would be mis-classified as named and skipped, leaving the IIFE
  // unlowered and `(IIFE)()` returning nil at runtime.
  if (findOwnDeclarationName(node)) return null;

  const synthName = `__anon_fn_${node.from}`;
  // Identify free variables (referenced inside the body but not bound
  // by the function's parameters or local declarations, and not a
  // known stdlib name). These are the closure's upvals. Captured by
  // value at the closure-definition site.
  const upvals = scanFreeVariables(node, ctx);

  // Dedupe: if an anonymous function from the SAME source position has
  // already been registered in the target buffer, skip re-pushing.
  // Compound-assignment lowering (`obj[fn()] += 1`) re-lowers the LHS
  // expression for the GET side, which re-lowers any anon fn inside
  // the index expression. Both lowerings produce the same `__anon_fn_<from>`
  // name, and a duplicate sibling triggers a hard "duplicate flow" error.
  // Since the source position is identical, both produce equivalent
  // Functions — keeping the first is correct.
  const alreadyRegistered = (buf: ParsedObject[] | undefined) =>
    !!buf?.some(
      (o) =>
        o instanceof Function && o.identifier?.name === synthName,
    );
  const stack = ctx.functionScopeStack;
  const targetBuf =
    stack && stack.length > 0
      ? stack[stack.length - 1]
      : ctx.hoistedKnots;
  if (alreadyRegistered(targetBuf)) {
    // First definition wins; reuse its name for the divert/closure
    // reference returned below.
    if (upvals.length === 0) {
      return new DivertTarget(new Divert([new Identifier(synthName)]));
    }
    const userArity = countUserParameters(node, ctx);
    return buildClosureExpression(synthName, upvals, userArity);
  }
  const fn = buildAnonymousFunction(node, synthName, ctx, upvals);
  if (!fn) return null;

  // If we're inside another function's body, attach the anonymous
  // function to the enclosing scope's buffer as a nested subFlow.
  // Otherwise (top-level expression context) fall back to the chunk-
  // wide hoist list so the anonymous knot still ends up addressable.
  if (stack && stack.length > 0) {
    stack[stack.length - 1].push(fn);
  } else if (ctx.hoistedKnots) {
    ctx.hoistedKnots.push(fn);
  } else {
    return null;
  }

  // Always emit the closure-shaped ObjectValue (even when there are
  // no upvals) so the runtime CallValueAsFunction dispatch has the
  // `__closure_user_arity` field available to pad under-supplied
  // args with nil. The no-upvals path is essentially free at runtime
  // (empty upvals map, fast extractClosurePath) so we don't lose
  // anything by unifying the two.
  const userArity = countUserParameters(node, ctx);
  return buildClosureExpression(synthName, upvals, userArity);
}

// Walk a function body for the names introduced via `local NAME = …`,
// `store NAME = …`, `const NAME = …`, AND nested `function NAME(...)
// end` declarations. Used to populate `ctx.declaredLocalsStack`
// frames so `scanFreeVariables` (running for a NESTED function) can
// detect when a name reference is shadowed by an enclosing-scope
// binding. The walk descends through nested blocks (`do`/`if`/`for`
// etc.) but stops at nested function-definition boundaries — locals
// declared inside a nested function live in THAT function's scope,
// not the parent's.
export function collectImmediateBodyDeclarations(
  fnDef: SyntaxNode,
  ctx: LowerContext,
): Set<string> {
  const out = new Set<string>();
  // Parameters are locals too (Lua scoping): a body call through a
  // param holding a function value (`function (g) return g(1, 2)
  // end`) must route through the VALUE-CALL path (CallValueExpression
  // carries the call-site arg count the runtime needs for variadic
  // packing), not static FunctionCall dispatch — and a nested
  // closure referencing a param must capture it as an upval rather
  // than treat it as a global.
  for (const p of collectParameterNames(fnDef, ctx)) {
    out.add(p);
  }
  const bodyContent = getFunctionBodyContent(fnDef);
  if (!bodyContent) return out;
  const walk = (n: SyntaxNode) => {
    if (n.name === "LuauFunctionDefinition" && n !== fnDef) {
      // Nested function — record the declared name on the parent
      // frame, but DON'T descend into the nested body (its locals
      // are scoped to itself). Scope the declaration-name lookup to
      // THIS nested fn's own header — `getDescendent` would otherwise
      // walk into further-nested function bodies.
      //
      // EXCEPTION — variadic nested fns (`function NAME(..., ...)`)
      // are NOT recorded as enclosing-scope locals. Variadic nested
      // fns route through `lowerNestedAsSubFlow` which only
      // registers the SubFlow — there's no `local NAME = closureValue`
      // binding emitted (the variadic call site needs static dispatch
      // for `PackTuple`, see comment in `lowerLuauFunctionDefinition`).
      // Recording the name as a local would make `scanFreeVariables`
      // capture the name as an upval in any sibling closure, then
      // `VariablePointerExpression(NAME)` would resolve to nil at
      // runtime since NAME isn't a real variable. Skipping it here
      // lets the sibling closure's call site fall through to
      // FunctionCall dispatch, which correctly diverts to the SubFlow
      // by ink path resolution.
      if (!hasOwnVariadicParameter(n)) {
        const declName = findOwnDeclarationName(n);
        if (declName) {
          const nameNode = getDescendent("LuauFunctionName", declName);
          if (nameNode) out.add(ctx.read(nameNode.from, nameNode.to));
        }
      }
      return;
    }
    if (n.name === "LuauVariableDefinition") {
      const ids = collectVarDefIdentifiers(n, ctx);
      for (const id of ids) out.add(id);
    }
    // Numeric `for var = start, stop[, step] do ... end` and generic
    // `for k, v in iter do ... end` both implicitly declare loop
    // variables. They're not LuauVariableDefinition nodes (the for
    // grammar embeds them inside `LuauForCondition`), so without this
    // branch they wouldn't appear in the enclosing function's
    // declared-locals set. That bit `scanFreeVariables` inside an
    // anonymous function whose body contains a for-loop: the loop
    // variable would be misclassified as a free variable, captured
    // as an upval, and end up duplicating the for-loop's own
    // binding. ONLY the loop targets count — names inside the
    // start/stop/step or iterator expressions are ordinary reads
    // (see collectForLoopTargetNames).
    if (n.name === "LuauForLoop" || n.name === "LuauGenericForLoop") {
      const condNode = getDescendent("LuauForCondition", n);
      if (condNode) {
        for (const name of collectForLoopTargetNames(condNode, ctx)) {
          out.add(name);
        }
      }
    }
    let c = n.firstChild;
    while (c) {
      walk(c);
      c = c.nextSibling;
    }
  };
  let child = bodyContent.firstChild;
  while (child) {
    walk(child);
    child = child.nextSibling;
  }
  return out;
}

// Collect ONLY the loop-target variable names from a
// `LuauForCondition` — the names being DECLARED by the loop:
//
//   for i = start, stop, step   → [i]      (names before the `=`)
//   for k, v in iterator        → [k, v]   (names before `in`)
//
// Names inside the start/stop/step or iterator expressions are
// ordinary reads of enclosing-scope variables. Treating them as
// loop-bound (the old behavior walked the WHOLE condition) broke
// upvalue capture: `local z = 0` + an IIFE containing
// `for i=10,1,z do` classified `z` as locally bound, skipped the
// capture, and the loop's step read nil at runtime (basic.luau
// lines 196-197).
function collectForLoopTargetNames(
  condNode: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const content =
    findContentChild(condNode, "LuauForCondition_content") ?? condNode;
  const names: string[] = [];
  let child = content.firstChild;
  while (child) {
    // Target list ends at the `=` (numeric) or `in` (generic).
    if (
      child.name === "LuauAssignmentOperation" ||
      child.name === "LuauInKeyword"
    ) {
      break;
    }
    if (child.name === "LuauAccessPath") {
      const nameNode = getDescendent("LuauVariableName", child);
      if (nameNode) names.push(ctx.read(nameNode.from, nameNode.to));
    }
    child = child.nextSibling;
  }
  return names;
}

// Does the immediate `LuauFunctionParameters` of this
// `LuauFunctionDefinition` contain a `LuauVariadicParameter`?
// Stop the descent at the params boundary so a nested-fn body
// containing its own `function inner(...)` doesn't read as variadic.
function hasOwnVariadicParameter(fnDefNode: SyntaxNode): boolean {
  let cursor: SyntaxNode | null = fnDefNode.firstChild;
  while (cursor) {
    if (cursor.name === "LuauFunctionDefinition_content") {
      let inner: SyntaxNode | null = cursor.firstChild;
      while (inner) {
        if (inner.name === "LuauFunctionParameters") {
          return !!getDescendent("LuauVariadicParameter", inner);
        }
        inner = inner.nextSibling;
      }
      break;
    }
    cursor = cursor.nextSibling;
  }
  return false;
}

export function scanFreeVariables(
  fnDef: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const params = collectParameterNames(fnDef, ctx);
  const bodyContent = getFunctionBodyContent(fnDef);
  if (!bodyContent) return [];
  const bound = new Set<string>(params);
  // Collect local-variable declarations inside the body. Walks the
  // whole subtree because locals can be declared inside nested
  // blocks; we conservatively over-include them as bound (a name
  // declared in any nested scope still satisfies "locally bound" for
  // the closure's outermost scope).
  walkAndCollect(bodyContent, (n) => {
    if (n.name === "LuauVariableDefinition") {
      const ids = collectVarDefIdentifiers(n, ctx);
      for (const id of ids) bound.add(id);
      return;
    }
    // Nested `function name() ... end` declarations bind `name` in
    // the enclosing scope (same as `local name = function() ... end`
    // since `lowerLuauFunctionDefinition` desugars nested forms to
    // local closures). Treat the declared name as locally bound so
    // the scanner doesn't capture it as an upvalue. Also bind the
    // names of nested function parameters? — no, those are scoped
    // to the nested function's body, not visible here.
    if (n.name === "LuauFunctionDefinition") {
      // Scope the declaration-name lookup to THIS nested fn's own
      // header — `getDescendent` would otherwise walk into
      // further-nested function bodies and bind the wrong name.
      const declName = findOwnDeclarationName(n);
      if (declName) {
        const nameNode = getDescendent("LuauFunctionName", declName);
        if (nameNode) bound.add(ctx.read(nameNode.from, nameNode.to));
      }
    }
    // Numeric / generic for-loops implicitly declare loop variables
    // that aren't `LuauVariableDefinition` nodes. Without binding
    // them here, `for b=1,9 do ... end` inside a closure body would
    // misclassify `b` as a free variable, capture it as an upval,
    // and surface as "Duplicate identifier `b`. A parameter named
    // `b` already exists for __anon_fn_X" when the for-loop's own
    // declaration then collides with the synthesized upval-param.
    // ONLY the loop targets are bound — names in the start/stop/step
    // or iterator expressions are reads of enclosing-scope variables
    // that MUST still be captured (see collectForLoopTargetNames).
    if (n.name === "LuauForLoop" || n.name === "LuauGenericForLoop") {
      const condNode = getDescendent("LuauForCondition", n);
      if (condNode) {
        for (const name of collectForLoopTargetNames(condNode, ctx)) {
          bound.add(name);
        }
      }
    }
  });
  // Collect referenced names (excluding stdlib, excluding bound).
  // Both VALUE-position references (`LuauVariable` — read a variable's
  // value) AND CALL-position references (`LuauFunctionCall`'s callee,
  // `LuauFunctionName`) count: a nested function calling a sibling
  // function in the enclosing scope needs to capture that sibling as
  // an upval so the closure-dispatch path can resolve it. Stdlib
  // functions are tagged by the grammar as `LuauStdLibFunctions`
  // (a different node), so they're auto-excluded from this walk.
  // Globally-addressable user-declared names (top-level knots,
  // `external NAME(...)`) are listed in `ctx.globalCallableNames`
  // and treated as bound here — the divert resolver finds them
  // directly without closure capture.
  const isGlobalCallable = (name: string) =>
    ctx.globalCallableNames?.has(name) ?? false;
  // Is `name` a sibling SubFlow in some enclosing scope? Variadic
  // nested fns route through `lowerNestedAsSubFlow` and don't emit
  // a `local NAME = closure` binding — capturing them as upvals
  // would `VariablePointerExpression(NAME)` to nil at runtime and
  // also bypasses the static `PackTuple` setup that variadic
  // dispatch requires. Instead, references fall through to
  // FunctionCall dispatch at the call site, which resolves NAME via
  // ink's relative-path walk to the enclosing-scope subFlow.
  const isSiblingSubFlow = (name: string) => {
    const stack = ctx.siblingSubFlowNamesStack;
    if (!stack) return false;
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]!.get(name);
      // Rebound entries (`f = <expr>` over a global/former subflow)
      // are dispatch metadata only — they must NOT suppress upval
      // capture decisions; the name resolves like any other
      // global/local reference here.
      if (entry !== undefined && !entry.rebound) return true;
    }
    return false;
  };
  // Is `name` declared as a local in some enclosing function scope?
  // Walks `ctx.declaredLocalsStack` outermost-first; finding the name
  // anywhere on the stack means the reference is locally shadowed
  // and must be captured as an upval — even if the name also matches
  // a stdlib identifier (`local count = 0; function f() count = count
  // + 1 end` — `count` IS a stdlib namespace, but the local
  // declaration shadows it and the closure body must route through
  // the local). Without this check the closure would silently fall
  // through to stdlib dispatch and the inner-scope mutation would
  // land on a new global instead of the outer local.
  const isShadowedLocal = (name: string) => {
    const stack = ctx.declaredLocalsStack;
    if (!stack) return false;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!.has(name)) return true;
    }
    return false;
  };
  const free: string[] = [];
  const seenFree = new Set<string>();
  const maybeCaptureFree = (name: string) => {
    if (bound.has(name) || seenFree.has(name)) return;
    // Sibling-subflow check FIRST — mirrors the call-dispatch
    // precedence (`isSiblingSubFlowName` before `isEnclosingLocalName`):
    // a variadic `function foo(...)` sibling is the innermost binding
    // and wins over a same-named local in an outer scope. Without
    // this ordering, basic.luau's chunk-level `local function foo`
    // (line 30) made every later sibling pair (`function foo(...) ...
    // function bar(...) return foo(...)`) capture `foo` as a phantom
    // upval — call sites then bound the first REAL arg to the
    // prepended upval parameter and dispatched `foo` as a variable.
    if (isSiblingSubFlow(name)) return;
    if (isShadowedLocal(name)) {
      // Shadowed — capture as upval regardless of stdlib status.
      seenFree.add(name);
      free.push(name);
      return;
    }
    if (isStdLibName(name) || isGlobalCallable(name)) return;
    seenFree.add(name);
    free.push(name);
  };
  walkAndCollect(bodyContent, (n) => {
    // `LuauVariableName` lives inside both binding sites and
    // reference sites. We only want REFERENCES — these appear under
    // `LuauVariable` (which is itself under `LuauAccessPart`).
    // `self` is tagged as `LuauSelfKeyword` inside `LuauVariable`,
    // so include it in the fallback chain — without this, an
    // inner anonymous function inside a colon-method body
    // (`function t:m() return (function() return self.f end)() end`)
    // wouldn't capture `self` as an upval and the runtime would
    // resolve it to nil.
    if (n.name === "LuauVariable") {
      const nameNode =
        getDescendent("LuauVariableName", n) ??
        getDescendent("LuauSelfKeyword", n);
      if (!nameNode) return;
      maybeCaptureFree(ctx.read(nameNode.from, nameNode.to));
      return;
    }
    // Function-call callees: `doit(args)` inside a nested function
    // body where `doit` is a local in the enclosing function scope.
    // The grammar wraps the callee identifier in
    // `LuauFunctionCall_begin > _c1 > LuauFunctionName`; pull the
    // name from there. Stdlib calls go through `LuauStdLibFunctions`
    // (different node), so they don't reach this branch.
    if (n.name === "LuauFunctionCall") {
      const nameNode = getDescendent("LuauFunctionName", n);
      if (!nameNode) return;
      maybeCaptureFree(ctx.read(nameNode.from, nameNode.to));
      return;
    }
    // Reference to a stdlib-named identifier in expression value
    // position (e.g. `local m = count` where `count` is a locally-
    // declared shadow of the `count.*` namespace). The grammar tags
    // these as `LuauStdLibConstants` (namespace names like `count`,
    // `math`, `string`) or `LuauStdLibFunctions` (callable globals
    // like `print`). When the corresponding name is shadowed by an
    // enclosing-scope local, we must capture it as an upval so the
    // closure body sees the local rather than the stdlib.
    if (
      n.name === "LuauStdLibConstants" ||
      n.name === "LuauStdLibFunctions"
    ) {
      const name = ctx.read(n.from, n.to).trim();
      if (isShadowedLocal(name)) maybeCaptureFree(name);
    }
  });
  return free;
}

// Returns true iff `name` appears as a function-call callee anywhere
// inside `fnDef`'s body. Used by `lowerLuauFunctionDefinition` to
// detect `local function f() ... f() ... end` — Lua's syntactic
// sugar that hoists the local so the body can self-reference. When
// true, we capture `f` as a closure upvalue and emit `local f` BEFORE
// assigning the closure value, so the upval pointer resolves to the
// live closure once it's written.
//
// Narrower than treating every `LuauFunctionCall` callee as a free
// variable, which would over-capture externals and top-level knot
// names (those are global identifiers, not closure upvals).
export function bodyReferencesNameAsCall(
  fnDef: SyntaxNode,
  ctx: LowerContext,
  name: string,
): boolean {
  const bodyContent = getFunctionBodyContent(fnDef);
  if (!bodyContent) return false;
  let found = false;
  walkAndCollect(bodyContent, (n) => {
    if (found) return;
    if (n.name === "LuauFunctionCall") {
      const nameNode = getDescendent("LuauFunctionName", n);
      if (!nameNode) return;
      if (ctx.read(nameNode.from, nameNode.to) === name) {
        found = true;
      }
    }
  });
  return found;
}

function walkAndCollect(
  root: SyntaxNode,
  visit: (n: SyntaxNode) => void,
): void {
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    visit(n);
    let c = n.firstChild;
    while (c) {
      stack.push(c);
      c = c.nextSibling;
    }
  }
}

function collectParameterNames(
  fnDef: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const params = getDescendent("LuauFunctionParameters", fnDef);
  if (!params) return [];
  // Parameters live inside `LuauFunctionParameter` (singular) nodes —
  // matching the convention used by `lowerArguments` for named
  // function definitions. The text inside each is the parameter
  // identifier as written by the user.
  const out: string[] = [];
  walkAndCollect(params, (n) => {
    if (n.name === "LuauFunctionParameter") {
      out.push(ctx.read(n.from, n.to).trim());
    }
  });
  return out;
}

function collectVarDefIdentifiers(
  varDef: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const content = findChildByName(varDef, "LuauVariableDefinition_content");
  if (!content) return [];
  const out: string[] = [];
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauVariableAssignment") {
      const nameNode = getDescendent("LuauVariableName", child);
      if (nameNode) out.push(ctx.read(nameNode.from, nameNode.to));
    }
    child = child.nextSibling;
  }
  return out;
}

// Heuristic: names matching common stdlib namespaces / globals don't
// need to be captured. The grammar tags `LuauStdLibConstants` /
// `LuauStdLibGlobals` / `LuauStdLibFunctions` inside `LuauVariable`,
// but at this scan layer we work from name text — a static set is
// simpler and good enough for V1. False positives (a user-defined
// `math` would not be captured) are acceptable since Luau warns
// against shadowing stdlib names anyway.
const STDLIB_NAMES_FOR_FREE_VAR_SCAN: ReadonlySet<string> = new Set([
  // Namespaces
  "math", "string", "table", "utf8", "bit32", "os", "vector",
  "coroutine", "debug", "task", "buffer",
  "count", "lang", "plural", "system",
  // Globals
  "_G", "_VERSION",
  // Functions
  "assert", "collectgarbage", "error", "gcinfo", "getfenv",
  "getmetatable", "ipairs", "loadstring", "newproxy", "next",
  "pairs", "pcall", "print", "rawequal", "rawget", "rawset",
  "require", "select", "setfenv", "setmetatable", "tonumber",
  "tostring", "type", "typeof", "unpack", "xpcall",
  // Keywords / control (shouldn't be referenced as values but just in case)
  "true", "false", "nil",
  // NOTE: `self` is NOT in this set. It's an implicit method receiver
  // parameter (for colon-form methods) or an ordinary user parameter
  // — never a stdlib-resolved global. When a nested closure inside a
  // method body references `self`, it must be captured as an upval
  // pointing at the outer frame's parameter slot. Treating it as a
  // stdlib name would block that capture and the inner closure would
  // see nil at runtime.
]);

function isStdLibName(name: string): boolean {
  return STDLIB_NAMES_FOR_FREE_VAR_SCAN.has(name);
}

export function countUserParameters(
  fnDef: SyntaxNode,
  ctx: LowerContext,
): number {
  return collectParameterNames(fnDef, ctx).length;
}

// Build the closure-value `ObjectExpression`. The shape is recognized
// by `CallValueAsFunction`'s closure-aware dispatch in Story.ts:
//   {
//     __closure_fn: -> __anon_fn_<offset>,
//     __closure_upvals: { "0": <upval0>, "1": <upval1>, ... },
//     __closure_user_arity: <K>,
//   }
//
// Each upval value is a `VariablePointerExpression` — at runtime that
// emits a `VariablePointerValue` referencing the outer-scope variable.
// The runtime auto-resolves the pointer's `contextIndex` to the
// current frame at push time and registers it as an "open upvalue".
// When the outer frame later pops, `CallStack.Pop` snapshots the
// current value into `pointer.closedValue`, so the closure keeps
// working after its lexical parent is gone (Lua semantics).
//
// Multiple closures capturing the same outer variable share a single
// `VariablePointerValue` (dedup happens at auto-resolve time), so
// mutations made by one closure are visible to the others — both
// while the parent is alive and after it has closed.
export function buildClosureExpression(
  synthName: string,
  upvals: string[],
  userArity: number,
): Expression {
  const fnDivert = new DivertTarget(
    new Divert([new Identifier(synthName)]),
  );
  const upvalEntries: ObjectExpressionEntry[] = upvals.map(
    (name, i) =>
      new ObjectExpressionEntry(
        String(i),
        new VariablePointerExpression(name),
      ),
  );
  const upvalObject = new ObjectExpression(upvalEntries);
  const arityExpr = new NumberExpression(userArity, "int");
  return new ObjectExpression([
    new ObjectExpressionEntry("__closure_fn", fnDivert),
    new ObjectExpressionEntry("__closure_upvals", upvalObject),
    new ObjectExpressionEntry("__closure_user_arity", arityExpr),
  ]);
}

const ANON_FUNCTION_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

// Mirror of `lowerLuauFunctionDefinition` but emits the new `Function`
// FlowBase subclass (callable, nestable inside any other FlowBase) with
// a caller-provided synthetic name rather than reading one from the
// source. The body content lives inside the same `_content` wrapper so
// we reuse `lowerStatements` with the same skip-set to filter out
// parameter/return-type/etc. boilerplate.
//
// When `upvals` is non-empty, those names are PREPENDED to the user
// parameters in the synthetic function's signature — the closure-
// dispatch path in `CallValueAsFunction` pushes them as the first N
// args at call time. The body's references to captured names then
// resolve as ordinary parameter reads, no rewriting required.
//
// Anonymous fns that themselves contain nested anonymous fns are
// supported: we open a per-function scope buffer for the duration of
// body lowering and attach any nested callables as subFlows.
export function buildAnonymousFunction(
  node: SyntaxNode,
  name: string,
  ctx: LowerContext,
  upvals: string[] = [],
): Function | null {
  const userArgs = lowerArguments(node, ctx);
  // Prepend upvals as parameters using the same `Argument` shape as
  // user params. At call time, the closure-dispatch path in
  // `CallValueAsFunction` pushes upvals before user args so the
  // parameter binding reads them in this order.
  const upvalArgs = upvals.map(
    (upvalName) => new Argument(new Identifier(upvalName), false, false),
  );
  const args = [...upvalArgs, ...userArgs];
  const content = getFunctionBodyContent(node);
  if (!content) return null;

  // Open a per-function buffer so anonymous / nested-named functions
  // declared INSIDE this anonymous fn's body attach to it as subFlows
  // instead of escaping to the enclosing scope. Also push the
  // anonymous fn's own locals onto the declared-locals stack so any
  // further-nested `scanFreeVariables` calls detect shadowing.
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const ownLocals = collectImmediateBodyDeclarations(node, ctx);
  ctx.declaredLocalsStack?.push(ownLocals);
  const innerHoisted: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(innerHoisted);
  const innerSiblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(innerSiblingSubFlows);
  const body = lowerStatements(content, ctx, ANON_FUNCTION_BODY_SKIP);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  return new Function(
    new Identifier(name),
    [...innerHoisted, ...body, ...nested],
    args as Argument[],
  );
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
  const stripped = stripQuotes(text);
  // Multiline `[[...]]` strings don't process escapes (Lua semantics),
  // but they DO normalize line endings to "\n" and drop a newline
  // appearing immediately after the opening bracket (`[[\nfoo]]` is
  // "foo"; `[[\n\n]]` is "\n"). Everything else (single/double-quoted)
  // interprets `\n`, `\t`, etc.
  let processed: string;
  if (node.name === "LuauMultilineString") {
    processed = stripped.replace(/\r\n|\r/g, "\n");
    if (processed.startsWith("\n")) processed = processed.slice(1);
  } else {
    processed = processLuauEscapes(stripped);
  }
  return new StringExpression([new Text(processed)]);
}

// Convert Luau string-literal escape sequences to their character
// values. Mirrors Luau's lexer: standard one-letter escapes
// (`\a \b \f \n \r \t \v`), quote escapes (`\' \"`), backslash
// (`\\`), brace (`\{`), and `\z` (skip following whitespace),
// plus numeric (`\ddd`), hex (`\xHH`), and Unicode (`\u{HHHH}`)
// forms. Unknown escapes pass the following character through.
function processLuauEscapes(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    if (i + 1 >= s.length) {
      out += "\\";
      break;
    }
    const next = s[i + 1]!;
    switch (next) {
      case "a":
        out += "\x07";
        i += 2;
        break;
      case "b":
        out += "\b";
        i += 2;
        break;
      case "f":
        out += "\f";
        i += 2;
        break;
      case "n":
        out += "\n";
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "v":
        out += "\v";
        i += 2;
        break;
      case "'":
      case '"':
      case "\\":
      case "{":
        out += next;
        i += 2;
        break;
      case "z": {
        i += 2;
        while (i < s.length && /\s/.test(s[i]!)) i++;
        break;
      }
      case "x": {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "u": {
        const m = s.slice(i + 2).match(/^\{([0-9a-fA-F]+)\}/);
        if (m) {
          out += String.fromCodePoint(parseInt(m[1]!, 16));
          i += 2 + m[0]!.length;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "\n":
        out += "\n";
        i += 2;
        break;
      default: {
        if (/\d/.test(next)) {
          // Decimal escape: 1–3 digits.
          const m = s.slice(i + 1).match(/^\d{1,3}/);
          if (m) {
            const code = parseInt(m[0]!, 10);
            if (code <= 255) {
              out += String.fromCharCode(code);
              i += 1 + m[0]!.length;
              break;
            }
          }
        }
        out += next;
        i += 2;
      }
    }
  }
  return out;
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
      parts.push(new Text(processLuauEscapes(textBuf)));
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
        // The grammar tags stdlib namespaces (`math`, `string`,
        // `utf8`, ...) as `LuauStdLibConstants` and top-level
        // globals (`_G`, `_VERSION`) as `LuauStdLibGlobals`, both
        // alongside the regular `LuauVariableName` capture. Look
        // for any of the three so paths like `math.pi`,
        // `utf8.charpattern`, and standalone `_VERSION` all feed
        // into the constant short-circuit below. `self` is tagged
        // as `LuauSelfKeyword` — treat it as a plain identifier so
        // colon-method bodies' `self` reads resolve to the prepended
        // parameter.
        const nameNode =
          getDescendent("LuauVariableName", inner) ??
          getDescendent("LuauStdLibConstants", inner) ??
          getDescendent("LuauStdLibGlobals", inner) ??
          getDescendent("LuauSelfKeyword", inner);
        if (nameNode) {
          identifiers.push(
            new Identifier(ctx.read(nameNode.from, nameNode.to)),
          );
        }
        break;
      }
      case "LuauPropertyAccessor": {
        // Metamethod names (`__len`, `__index`, ...) are tagged by the
        // grammar as `LuauStdLibMethods` rather than `LuauPropertyName`.
        const nameNode =
          getDescendent("LuauPropertyName", inner) ??
          getDescendent("LuauStdLibMethods", inner);
        if (nameNode) {
          identifiers.push(
            new Identifier(ctx.read(nameNode.from, nameNode.to)),
          );
        }
        break;
      }
      case "LuauFunctionCall": {
        if (i === 0) {
          // Grammar tags reserved stdlib names (`assert`, `print`,
          // `tostring`, ...) under `LuauStdLibFunctions` rather than
          // `LuauFunctionName`. Look for either, BUT scope the
          // search to the `_begin` subtree — a deep `getDescendent`
          // can otherwise walk into nested calls' names inside
          // `LuauFunctionCallParameters` and pick the wrong one
          // (e.g. `select("#", multi())` resolving to `multi`).
          const nameStr = readFunctionCallName(inner, ctx);
          // The grammar's greedy `LuauFunctionCall` body absorbs
          // multiple `(args)` runs into one call node — `f(a)(b)`
          // parses as `LuauFunctionCall(f, params=(a), params=(b))`.
          // Collect EVERY parameter-set so we can chain value-calls.
          const argLists = collectAllCallParameterArgLists(inner, ctx);
          const args = argLists[0] ?? [];
          if (nameStr) {
            // If the callee name resolves to an enclosing-scope
            // LOCAL binding (not a stdlib, knot, or sibling
            // variadic SubFlow), route through `CallValueExpression`
            // on a `VariableReference` instead of `FunctionCall`.
            // Otherwise the lowerer emits `Divert(-> NAME)` which
            // fails compile-time `target not found` when NAME is a
            // variable, not a knot. The runtime variable-divert
            // path already handles closures, `__call` metamethods,
            // and (now) `__stdlib_fn` markers from a CallValue
            // dispatch site.
            //
            // We DON'T re-route for stdlib names, top-level callables,
            // or sibling variadic SubFlows — those resolve via
            // FunctionCall + Divert correctly. Limiting the re-route
            // to declared-locals avoids regressing the common path.
            // The sibling-subflow check comes FIRST: it's the
            // innermost binding, so a variadic `function foo(...)` in
            // THIS function shadows a same-named local in an outer
            // scope (see isSiblingSubFlowName).
            if (resolveCallableBinding(nameStr, ctx) === "local") {
              const receiver = new VariableReference([new Identifier(nameStr)]);
              const baseCall = new CallValueExpression(receiver, args);
              return wrapChainedValueCalls(baseCall, argLists.slice(1));
            }
            // Sibling subflows dispatch against their CONTAINER name
            // — mangled when the source name was redefined (see
            // SiblingSubFlowInfo.knotName).
            const callName =
              siblingSubFlowInfo(nameStr, ctx)?.knotName ?? nameStr;
            const base = makeGlobalFunctionCall(
              new Identifier(callName),
              withSiblingSubFlowUpvalArgs(nameStr, args, ctx),
              inner,
              ctx,
            );
            return wrapChainedValueCalls(base, argLists.slice(1));
          }
        }
        break;
      }
      default:
        // LuauFunctionAccessor (method call) deferred.
        break;
    }
  }

  if (identifiers.length > 0) {
    // Sibling variadic subflow referenced as a VALUE (`call(c12, ...)`,
    // `local h = c12`, `type(c12)`): variadic nested fns stay
    // knot-form subflows of the enclosing function (see
    // lowerLuauFunctionDefinition) — there's no local variable
    // holding a closure, so a VariableReference would read nil and
    // the runtime Knot fallback only checks TOP-LEVEL knots. No
    // captures → a bare DivertTarget (the runtime value-call path
    // packs `...` args for those). With captures → a closure-shaped
    // value whose upval pointers snapshot the enclosing frame's
    // cells at REFERENCE time, exactly like anonymous closures —
    // `extractClosurePath` re-threads them below the user args at
    // call time (vararg.luau line 74: `call(f, a)` where f captures
    // `lim`).
    if (
      identifiers.length === 1 &&
      resolveCallableBinding(identifiers[0]!.name, ctx) === "sibling"
    ) {
      const info = siblingSubFlowInfo(identifiers[0]!.name, ctx);
      const knotName = info?.knotName ?? identifiers[0]!.name;
      if (info && info.upvals.length > 0) {
        return buildClosureExpression(knotName, info.upvals, info.arity);
      }
      return new DivertTarget(new Divert([new Identifier(knotName)]));
    }
    // Stdlib constant short-circuit: when the dotted path matches a
    // registered constant (`math.pi`, `math.huge`, `_VERSION`, ...),
    // emit the value directly instead of a `VariableReference` that
    // would fail to resolve at runtime. Compile-time substitution —
    // no runtime dispatch needed.
    const dotted = identifiers.map((id) => id.name).join(".");
    const constVal = lookupStdLibConstant(dotted);
    if (constVal !== undefined) {
      if (typeof constVal === "number") {
        return new NumberExpression(
          constVal,
          Number.isInteger(constVal) && Number.isFinite(constVal) ? "int" : "float",
        );
      }
      if (typeof constVal === "string") {
        return new StringExpression([new Text(constVal)]);
      }
      if (typeof constVal === "boolean") {
        return new NumberExpression(constVal, "bool");
      }
    }
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
    const nameStr = readFunctionCallName(firstInner, ctx);
    if (!nameStr) return null;
    const name = new Identifier(nameStr);
    // Greedy grammar packs `f(a)(b)(c)` into one call node with N
    // parameter-sets. Collect all, use the first as the base call's
    // args, and chain the rest as `CallValueExpression` wrappers.
    const argLists = collectAllCallParameterArgLists(firstInner, ctx);
    const args = argLists[0] ?? [];
    // Mirror the dispatch decision in lowerCallStartingAccessPath
    // above: an enclosing-scope local binding becomes a value-call —
    // unless a sibling variadic SubFlow shadows it (innermost wins).
    if (resolveCallableBinding(nameStr, ctx) === "local") {
      const receiver = new VariableReference([new Identifier(nameStr)]);
      current = wrapChainedValueCalls(
        new CallValueExpression(receiver, args),
        argLists.slice(1),
      );
    } else {
      // Sibling subflows dispatch against their CONTAINER name —
      // mangled when the source name was redefined.
      const callName = siblingSubFlowInfo(nameStr, ctx)?.knotName ?? nameStr;
      const base = makeGlobalFunctionCall(
        new Identifier(callName),
        withSiblingSubFlowUpvalArgs(nameStr, args, ctx),
        firstInner,
        ctx,
      );
      current = wrapChainedValueCalls(base, argLists.slice(1));
    }
    i = 1;
  } else {
    // Gather the leading dot-path identifier run as the initial
    // VariableReference base.
    const leading: Identifier[] = [];
    for (; i < parts.length; i++) {
      const inner = parts[i]!.firstChild;
      if (!inner) continue;
      if (inner.name === "LuauVariable") {
        // Mirror lowerSimpleAccessPath: stdlib namespaces and globals
        // (`math`, `_G`, ...) are tagged `LuauStdLibConstants` /
        // `LuauStdLibGlobals` instead of `LuauVariableName`, but they
        // are valid value-chain roots — `_G['foo']` indexes the
        // globals-table proxy.
        const nameNode =
          getDescendent("LuauVariableName", inner) ??
          getDescendent("LuauStdLibConstants", inner) ??
          getDescendent("LuauStdLibGlobals", inner) ??
          getDescendent("LuauSelfKeyword", inner);
        if (nameNode) {
          leading.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
        }
        continue;
      }
      if (inner.name === "LuauPropertyAccessor") {
        const nameNode =
          getDescendent("LuauPropertyName", inner) ??
          getDescendent("LuauStdLibMethods", inner);
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
      const nameNode =
        getDescendent("LuauPropertyName", inner) ??
        getDescendent("LuauStdLibMethods", inner);
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

// Resolve the function NAME of a `LuauFunctionCall` node by looking
// inside its `_begin` subtree only. Without the scope restriction,
// `getDescendent("LuauFunctionName", node)` would walk past the
// function's begin block into its `LuauFunctionCallParameters` and
// Is `name` declared as a local in any enclosing function scope?
// Walks `ctx.declaredLocalsStack` from innermost to outermost — any
// match means the callee resolves to a variable binding, not a knot
// path. The lowerer uses this to route bare `NAME(args)` calls
// through `CallValueExpression(VariableReference([NAME]), args)`
// instead of `FunctionCall(NAME, args)` when NAME is a local var;
// FunctionCall lowers to a Divert that errors at compile time with
// `target not found: -> NAME` since NAME isn't a knot.
//
// Variadic sibling SubFlows (tracked separately on
// `siblingSubFlowNamesStack`) are intentionally NOT here — those
// resolve via FunctionCall + Divert against the SubFlow's actual
// name, which the resolver finds via ink's relative-path walk.
function isEnclosingLocalName(name: string, ctx: LowerContext): boolean {
  const stack = ctx.declaredLocalsStack;
  if (!stack) return false;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.has(name)) return true;
  }
  return false;
}

// Resolve a bare callable name against the lexical scope chain,
// innermost frame first. Every function-lowering site pushes one
// frame onto BOTH `declaredLocalsStack` and
// `siblingSubFlowNamesStack` in tandem (see
// lowerLuauFunctionDefinition / lowerAnonymousFunction), so frames
// align by index. Within one frame a variadic sibling subflow wins
// over a same-named local; ACROSS frames the inner binding wins
// regardless of kind — a lambda param `f` shadows an outer variadic
// `function f(...)` (vararg.luau's `call = function (f, args)`), and
// an inner variadic `function foo(...)` shadows an outer
// `local function foo` (basic.luau line 342). A flat
// "sibling-check-first" rule gets one of those two wrong whichever
// way it's ordered.
function resolveCallableBinding(
  name: string,
  ctx: LowerContext,
): "sibling" | "local" | null {
  const locals = ctx.declaredLocalsStack ?? [];
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  const depth = Math.max(locals.length, siblings.length);
  for (let i = depth - 1; i >= 0; i--) {
    const sibling = siblings[i]?.get(name);
    if (sibling !== undefined) {
      // Rebound names (`f = <expr>` over a former subflow or a bare
      // global) dispatch as VALUE calls, not static diverts.
      return sibling.rebound ? "local" : "sibling";
    }
    if (locals[i]?.has(name)) return "local";
  }
  return null;
}

// Is `name` a variadic sibling SubFlow in ANY enclosing function
// scope? Variadic nested fns (`function foo(...)`) lower as real
// SubFlows with no `local NAME = closure` binding. NOTE: call/value
// dispatch should use `resolveCallableBinding` instead — it respects
// per-frame shadowing (a lambda param `f` beats an outer sibling
// `f`); this flat check remains for the free-variable scan, where
// any-frame membership is the right question.
function isSiblingSubFlowName(name: string, ctx: LowerContext): boolean {
  const stack = ctx.siblingSubFlowNamesStack;
  if (!stack) return false;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.has(name)) return true;
  }
  return false;
}

// The registry entry of a sibling variadic SubFlow (captured upval
// names + declared fixed arity), or null when `name` isn't a
// registered subflow. Call sites prepend one
// `VariablePointerExpression` per upval (mirroring the closure-upval
// mechanism) so the subflow's prepended upval PARAMETERS receive the
// enclosing scope's cells — reads and writes go through the shared
// cell, and self-recursive calls thread the subflow's own upval
// params down each level.
function siblingSubFlowInfo(
  name: string,
  ctx: LowerContext,
): SiblingSubFlowInfo | null {
  const stack = ctx.siblingSubFlowNamesStack;
  if (!stack) return null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const hit = stack[i]!.get(name);
    if (hit !== undefined) return hit;
  }
  return null;
}

function siblingSubFlowUpvals(
  name: string,
  ctx: LowerContext,
): string[] | null {
  return siblingSubFlowInfo(name, ctx)?.upvals ?? null;
}

// Prepend a sibling subflow's upval pointers to a call's arg list.
// No-op (returns `args` unchanged) when `name` isn't a registered
// sibling subflow or captures nothing.
function withSiblingSubFlowUpvalArgs(
  name: string,
  args: Expression[],
  ctx: LowerContext,
): Expression[] {
  const upvals = siblingSubFlowUpvals(name, ctx);
  if (!upvals || upvals.length === 0) return args;
  return [
    ...upvals.map((n) => new VariablePointerExpression(n)),
    ...args,
  ];
}

// surface a nested call's name — e.g. `select("#", multi())` would
// resolve to "multi" instead of "select" because select is captured
// as `LuauStdLibFunctions` (not `LuauFunctionName`).
function readFunctionCallName(
  callNode: SyntaxNode,
  ctx: LowerContext,
): string | null {
  // Scope the search to `_begin` so a deep descendant walk doesn't
  // surface a nested call's name from inside the function's args
  // (e.g. `select("#", multi())` would otherwise resolve to "multi"
  // because select is captured as `LuauStdLibFunctions` while the
  // inner `multi` is captured as `LuauFunctionName`, and the deep
  // search hits LuauFunctionName first).
  const begin = findChildByName(callNode, "LuauFunctionCall_begin");
  const searchRoot = begin ?? callNode;
  const nameNode =
    getDescendent("LuauStdLibFunctions", searchRoot) ??
    getDescendent("LuauFunctionName", searchRoot);
  return nameNode ? ctx.read(nameNode.from, nameNode.to) : null;
}

function lowerCallArguments(
  callNode: SyntaxNode,
  ctx: LowerContext,
): Expression[] {
  // Lua/Luau call-sugar: `f{...}` and `f"..."` are equivalent to
  // `f({...})` / `f("...")` — a single table-/string-arg call. The
  // grammar absorbs the table/string as a body child of the
  // LuauFunctionCall instead of wrapping it in LuauFunctionCallParameters.
  // Check the FIRST `_content` child to see which shape we have, then
  // route accordingly. Falls back to () empty args if neither shape
  // matches (defensive — should not happen in practice).
  const params = getDescendent("LuauFunctionCallParameters", callNode);
  if (params) {
    return lowerArgListFromParams(params, ctx);
  }
  const sugar = findCallSugarArgNode(callNode);
  if (sugar) {
    const expr = lowerPrimary(sugar, ctx);
    return expr ? [expr] : [];
  }
  return [];
}

// Find the first table-/string-sugar arg child of a LuauFunctionCall —
// the body shape used by `f{...}` and `f"..."` / `f[[...]]` calls.
function findCallSugarArgNode(callNode: SyntaxNode): SyntaxNode | null {
  const content = findChildByName(callNode, "LuauFunctionCall_content");
  const root = content ?? callNode;
  let child = root.firstChild;
  while (child) {
    if (isCallSugarArg(child)) return child;
    child = child.nextSibling;
  }
  return null;
}


function isCallSugarArg(node: SyntaxNode): boolean {
  const k = node.name;
  return (
    k === "LuauTable" ||
    k === "LuauDoubleQuotedString" ||
    k === "LuauSingleQuotedString" ||
    k === "LuauMultilineString" ||
    k === "LuauInterpolatedString"
  );
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

// Walk a `LuauFunctionCall` node's `_content` and collect each
// `LuauFunctionCallParameters` child. Lua's `f(a)(b)(c)` syntax
// chains value-calls — the grammar's greedy LuauFunctionCall body
// consumes ALL the `(args)` runs as siblings within the same call
// container. We return the per-call arg lists so the caller can
// build a `CallValueExpression` chain on top of the initial
// `FunctionCall(name, args[0])`.
function collectAllCallParameterArgLists(
  callNode: SyntaxNode,
  ctx: LowerContext,
): Expression[][] {
  const content = findChildByName(callNode, "LuauFunctionCall_content");
  if (!content) {
    // No content wrapper — fall back to scanning direct children.
    return collectParameterArgListsFromContainer(callNode, ctx);
  }
  return collectParameterArgListsFromContainer(content, ctx);
}

function collectParameterArgListsFromContainer(
  container: SyntaxNode,
  ctx: LowerContext,
): Expression[][] {
  const allArgs: Expression[][] = [];
  let child = container.firstChild;
  while (child) {
    if (child.name === "LuauFunctionCallParameters") {
      allArgs.push(lowerArgListFromParams(child, ctx));
    } else if (isCallSugarArg(child)) {
      // Table-/string-sugar call link: `f{...}`, `f"..."`. The
      // body child IS the single arg. Lower as a primary and wrap
      // it in a single-element arg list so the chain-folding caller
      // produces `CallValueExpression(prev, [sugarArg])`.
      const expr = lowerPrimary(child, ctx);
      allArgs.push(expr ? [expr] : []);
    }
    child = child.nextSibling;
  }
  return allArgs;
}

// Lower the comma-separated content of a single
// `LuauFunctionCallParameters` node into an `Expression[]`. Same
// shape as `lowerCallArguments` but works on the params node directly
// (instead of searching for it in a parent).
function lowerArgListFromParams(
  params: SyntaxNode,
  ctx: LowerContext,
): Expression[] {
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

// Wrap a base call expression in `CallValueExpression` links for each
// extra arg-list past the first. `f(a)(b)(c)` → `CallValue(CallValue(
// FunctionCall(f, a), b), c)`. The first call uses the base; the rest
// are value-call dispatches on the result via `CallValueAsFunction`.
function wrapChainedValueCalls(
  base: Expression,
  extraArgLists: Expression[][],
): Expression {
  let expr = base;
  for (const args of extraArgLists) {
    expr = new CallValueExpression(expr, args);
  }
  return expr;
}

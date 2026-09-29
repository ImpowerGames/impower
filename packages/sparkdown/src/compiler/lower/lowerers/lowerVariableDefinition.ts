import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lower } from "../lower";
import {
  lowerExpressionFromContainerAndContinuation,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import {
  continuationParts,
  endsInTypeName,
  isTypeQualifierContinuation,
  reportExtraTypeQualifiers,
  markLineContinuationUsed,
  splitOnCommas,
  takeLineContinuation,
} from "../utils/lineContinuation";
import { validateAssignmentValue } from "../utils/validateAssignmentValue";
import { validateDefineTypeShadow } from "../utils/validateDefineTypeShadow";
import { identifierAt } from "../utils/debugMetadata";
import {
  forwardBlockDiagnostics,
  unwrapBlockContent,
} from "../utils/unwrapBlock";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerVariableDefinition(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
  const scope = scopeNode ? ctx.read(scopeNode.from, scopeNode.to).trim() : "";
  // The lines that continue the last value (`local y = t` then `.a`), or
  // the last target's type (`local x: types` then `.Button = 1`).
  const continuation = takeLineContinuation(ctx);

  // Walk `LuauVariableDefinition_content`. After the multi-RHS grammar
  // fix, the content holds:
  //   VA(name1) [, name1's-AssignmentOperation? ...]
  //   LuauCommaSeparator
  //   VA(name2) [...]
  //   LuauCommaSeparator
  //   <RHS expression>   ← extra trailing RHS values (multi-RHS case)
  //   LuauCommaSeparator
  //   <RHS expression>
  //
  // Only the LAST VA can carry a `LuauAssignmentOperation` (since
  // earlier VAs are pure targets). Any expression nodes after the
  // last VA are additional RHS values.
  const contentNode = findChildByName(
    nodeRef.node,
    "LuauVariableDefinition_content",
  );
  const targets: { name: string; assignNode: SyntaxNode; nameNode?: SyntaxNode }[] = [];
  const targetIdentifier = (t: (typeof targets)[number]) =>
    t.nameNode ? identifierAt(t.nameNode, ctx) : new Identifier(t.name);
  const trailingRhsGroups: SyntaxNode[][] = [];
  let sawAssignmentOp = false;
  let currentRhsGroup: SyntaxNode[] = [];
  // When the grammar accepts multiple statements on one line (e.g.
  // `local x = 5 return x end`), the LuauVariableDefinition_content
  // captures siblings BEYOND the variable assignment — they're
  // adjacent statements, not trailing multi-RHS values. Collect them
  // into `trailingStatements` and lower them after the VA below.
  const trailingStatements: SyntaxNode[] = [];

  if (contentNode) {
    let child = contentNode.firstChild;
    while (child) {
      if (isSkippableName(child.name)) {
        child = child.nextSibling;
        continue;
      }
      if (child.name === "LuauVariableAssignment") {
        // Flush any in-progress RHS group before starting a new
        // target. (Shouldn't happen with current grammar — VAs
        // always come before any standalone RHS exprs — but handle
        // it defensively.)
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        const nameNode = getDescendent("LuauVariableName", child);
        if (nameNode) {
          targets.push({
            name: ctx.read(nameNode.from, nameNode.to),
            assignNode: child,
            nameNode,
          });
        }
        const opNode = getDescendent("LuauAssignmentOperation", child);
        if (opNode) sawAssignmentOp = true;
        child = child.nextSibling;
        continue;
      }
      if (child.name === "LuauCommaSeparator") {
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        child = child.nextSibling;
        continue;
      }
      // Bare declaration target — `local a` with NO initializer. When
      // no `=` follows the name (because a same-line statement comes
      // next, e.g. `local a if a then ... end`), the grammar emits the
      // name as a plain `LuauAccessPath` instead of a
      // `LuauVariableAssignment` wrapper. Without this case the path
      // fell through to the RHS-expression bucket, `targets` stayed
      // empty, and the whole declaration was silently dropped — so
      // `a` resolved to any same-named GLOBAL instead of a fresh nil
      // local (basic.luau line 84). Only a single-segment plain
      // variable counts; property paths (`t.x`) really are RHS
      // expressions. Restricted to BEFORE any `=` is seen — after an
      // assignment op, access paths are RHS values.
      if (
        child.name === "LuauAccessPath" &&
        !sawAssignmentOp &&
        currentRhsGroup.length === 0
      ) {
        const bareName = bareVariableNameFromAccessPath(child, ctx);
        if (bareName) {
          targets.push({ name: bareName, assignNode: child });
          child = child.nextSibling;
          continue;
        }
      }
      // Statement-like node — sparkdown's grammar lets these share a
      // single source line with the variable definition (e.g.
      // `local x = 5 return x end`). The VA captures everything up
      // to (but not including) the statement; the statement itself
      // is a sibling that needs its own lowering pass.
      if (TRAILING_STATEMENT_NAMES.has(child.name)) {
        // Flush any partial RHS group first — `local a, b = 1 return x`
        // shouldn't be possible in valid Luau, but if it appears we
        // treat the RHS slot as complete and the statement as a
        // sibling.
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        trailingStatements.push(child);
        child = child.nextSibling;
        continue;
      }
      // Any other node at the def-content level is a trailing
      // RHS expression (LuauNumericDecimal, LuauAccessPath,
      // LuauTable, LuauParenthetical, etc.).
      currentRhsGroup.push(child);
      child = child.nextSibling;
    }
    if (currentRhsGroup.length > 0) {
      trailingRhsGroups.push(currentRhsGroup);
    }
  }

  if (targets.length === 0) {
    // Fallback for an unrecognized shape — bail without emitting.
    return {};
  }

  // Global declarations (`store` / `const`) that reuse a define TYPE name
  // shadow the type's bare Luau global — warn. Covers every downstream path
  // below (single/multi store, const). `local` is exempt: lexical shadowing
  // inside a function body is ordinary Luau and expected.
  if (scope === "store" || scope === "const") {
    for (const t of targets) {
      validateDefineTypeShadow(t.name, t.assignNode, ctx);
    }
  }

  // `local f = ...` over a name that statically referred to a sibling
  // variadic subflow (`function f(...)` earlier in this function):
  // the local SHADOWS the subflow from here on, lexically — drop the
  // registry entries so later `f` references and calls resolve as the
  // variable instead of emitting diverts to the knot (math.luau line
  // 503's `local v,f = math.modf(...)` after the chunk-level
  // `function f(...)`; the stale value-ref produced an unresolvable
  // DivertTarget that crashed JSON serialization). Mirrors
  // lowerReassignment's rebind handling — registry consulted in
  // lexical order, so earlier call sites keep the knot binding.
  if (ctx.siblingSubFlowNamesStack) {
    for (const t of targets) {
      for (const frame of ctx.siblingSubFlowNamesStack) {
        frame.delete(t.name);
      }
    }
  }

  // The LAST target's `LuauAssignmentOperation` carries the first
  // RHS value. Subsequent RHS values are at the def-content level.
  const lastTarget = targets[targets.length - 1]!;
  let firstRhsOp: SyntaxNode | undefined = getDescendent(
    "LuauAssignmentOperation",
    lastTarget.assignNode,
  );
  // The continuation's first comma group continues the last value; its
  // later groups are further values. When statements share the line after
  // the declaration, the continuation continues the last of them instead.
  const [continued = [], ...continuedRhsGroups] =
    trailingStatements.length > 0 ? [] : splitOnCommas(continuation);
  let firstRhsContinuation: SyntaxNode[] = [];
  if (!firstRhsOp && continued.length > 0) {
    // `local x: types` then `.Button`, or `.Button = 1`: the
    // continuation's access parts qualify the type, which does not reach
    // the runtime, and its assignment gives the value. Any other
    // continuation is left unused, and reported.
    const opAt = continued.findIndex(
      (n) => n.name === "LuauAssignmentOperation",
    );
    const qualifiers = opAt >= 0 ? continued.slice(0, opAt) : continued;
    const typed = getDescendent(
      "LuauTypeAnnotationOperation",
      lastTarget.assignNode,
    );
    if (
      typed &&
      endsInTypeName(typed) &&
      isTypeQualifierContinuation(qualifiers)
    ) {
      markLineContinuationUsed(qualifiers, ctx);
      reportExtraTypeQualifiers(typed, continuationParts(qualifiers), ctx);
      if (opAt >= 0) {
        firstRhsOp = continued[opAt]!;
        firstRhsContinuation = continued.slice(opAt + 1);
      }
    }
  } else if (trailingRhsGroups.length > 0) {
    trailingRhsGroups[trailingRhsGroups.length - 1]!.push(...continued);
  } else {
    firstRhsContinuation = continued;
  }
  trailingRhsGroups.push(...continuedRhsGroups);
  if (firstRhsOp) validateAssignmentValue(firstRhsOp, ctx);
  const firstRhs = firstRhsOp
    ? lowerExpressionFromContainerAndContinuation(
        firstRhsOp,
        firstRhsContinuation,
        ctx,
      )
    : null;
  const trailingExprs = trailingRhsGroups
    .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
    .filter((e): e is NonNullable<typeof e> => e != null);
  const expressions = firstRhs ? [firstRhs, ...trailingExprs] : trailingExprs;

  // `const x = expr` — must be single-target, single-RHS. Reject
  // multi-target const and multi-RHS const (Luau doesn't support
  // either form for `const`).
  if (scope === "const") {
    if (targets.length !== 1 || expressions.length !== 1) return {};
    return wrapInWeave(
      withTrailingStatements(
        [new ConstantDeclaration(targetIdentifier(lastTarget), expressions[0]!)],
        trailingStatements,
        continuation,
        ctx,
      ),
    );
  }

  // Multi-target. Two paths:
  //
  //   `local a, b = …`  → route through `MultiVariableAssignment` so
  //   the runtime gets a proper `PackTuple` + `UnpackTuple` sequence —
  //   handles both multi-RHS positional and single-RHS multi-return.
  //
  //   `store a, b = …`  → synthesize one `VariableAssignment` per
  //   target with the positionally-corresponding expression (missing
  //   slots get no expression, which defaults to 0 at story init).
  //   Globals don't emit procedural runtime objects — they register
  //   at the story level and the story evaluates each expression at
  //   init time, so the `MultiVariableAssignment` Pack/Unpack flow
  //   doesn't apply. Single-RHS multi-return into multi-target globals
  //   (`store a, b = f()`) takes only f()'s first value — to fully
  //   unpack, authors should use a local intermediate.
  //
  //   `const a, b = …` is rejected — `const` requires single-target.
  if (targets.length > 1) {
    if (scope === "local") {
      const targetIdents = targets.map(targetIdentifier);
      // Bare multi-declaration (`local a, b` with no `= …`): give
      // UnpackTuple one NullExpression to unpack — it pads the
      // remaining slots with nil. With zero expressions it would pop
      // whatever junk happened to be on the eval stack.
      const multiExprs =
        expressions.length === 0 && !sawAssignmentOp
          ? [new NullExpression()]
          : expressions;
      return wrapInWeave(
        withTrailingStatements(
          [new MultiVariableAssignment(targetIdents, multiExprs, true)],
          trailingStatements,
          continuation,
          ctx,
        ),
      );
    }
    if (scope === "store") {
      const vas = targets.map((t, i) => {
        const e = expressions[i] ?? null;
        return new VariableAssignment({
          variableIdentifier: targetIdentifier(t),
          assignedExpression: e ?? undefined,
          isGlobalDeclaration: true,
        });
      });
      return wrapInWeave(withTrailingStatements(vas, trailingStatements, continuation, ctx));
    }
    // `const a, b = …` — not supported.
    return {};
  }

  // Single target. If there are multiple RHS expressions (`local x = a, b`),
  // Lua truncates to the first value — but with `MultiValue` spread
  // semantics, the LAST expression spreads if it's multi-return.
  // For now we just take the first expression (matches Lua's
  // single-target truncation) since single-target rarely uses
  // multi-RHS in practice.
  //
  // Bare declaration (`local x` with no `= …`) is also handled here:
  // we synthesize a `NullExpression` so the runtime gets a `NullValue`
  // pushed before the `RuntimeVariableAssignment`. Without the
  // synthetic init, the binding bytecode would pop whatever junk
  // happened to be on the eval stack.
  const identifier = targetIdentifier(lastTarget);
  const expr = expressions[0] ?? (sawAssignmentOp ? null : new NullExpression());

  const isGlobal = scope === "store";
  const isTemp = scope === "local";

  const va = new VariableAssignment({
    variableIdentifier: identifier,
    assignedExpression: expr ?? undefined,
    isGlobalDeclaration: isGlobal,
    isTemporaryNewDeclaration: isTemp,
  });

  return wrapInWeave(withTrailingStatements([va], trailingStatements, continuation, ctx));
}

// Lower each trailing-statement node via the main `lower()` dispatcher
// and append the resulting ParsedObjects to the head list. Used when
// the grammar's permissive content rules let a `LuauVariableDefinition`
// share a source line with following statements (e.g.
// `local x = 5 return x end` — the `return x` is a sibling, not part
// of the RHS).
//
// The last of them is offered the declaration's continuation lines, which
// continue the line's last statement (`local x = 1 local y = t` then `.a`).
function withTrailingStatements(
  head: ParsedObject[],
  trailingStatements: SyntaxNode[],
  continuation: SyntaxNode[],
  ctx: LowerContext,
): ParsedObject[] {
  if (trailingStatements.length === 0) return head;
  const out: ParsedObject[] = [...head];
  for (const [index, stmt] of trailingStatements.entries()) {
    ctx.lineContinuation =
      index === trailingStatements.length - 1 ? continuation : null;
    const block = lower(stmt as unknown as SparkdownSyntaxNodeRef, ctx);
    ctx.lineContinuation = null;
    forwardBlockDiagnostics(block, ctx);
    out.push(...unwrapBlockContent(block));
  }
  return out;
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

// Returns the variable name when the access path is exactly ONE
// plain-variable segment (`a` — no property accessors, indexers, or
// calls); null otherwise. Used to recognize the bare uninitialized
// declaration form (`local a`) when the grammar emits the name as a
// plain `LuauAccessPath`.
function bareVariableNameFromAccessPath(
  accessPath: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  const root = content ?? accessPath;
  let part: SyntaxNode | null = null;
  let child = root.firstChild;
  while (child) {
    if (child.name === "LuauAccessPart") {
      if (part) return null;
      part = child;
    }
    child = child.nextSibling;
  }
  const inner = part?.firstChild;
  if (inner?.name !== "LuauVariable") return null;
  const nameNode = getDescendent("LuauVariableName", inner);
  return nameNode ? ctx.read(nameNode.from, nameNode.to) : null;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "LuauVariableDefinition_begin" ||
    name === "LuauVariableDefinition_end"
  );
}

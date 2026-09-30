import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import {
  VARIABLE_DEFINITION_BEGIN_NAMES,
  VARIABLE_DEFINITION_END_NAMES,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/engine/Error";
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
  typeUnionLineValue,
  takeLineContinuation,
} from "../utils/lineContinuation";
import {
  validateAssignmentValue,
  validateListComma,
  validateSecondAssignment,
} from "../utils/validateAssignmentValue";
import { validateDefineTypeShadow } from "../utils/validateDefineTypeShadow";
import { identifierAt } from "../utils/debugMetadata";
import { statementSource } from "../utils/statementSource";
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
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

  // Walk the definition's content (`LuauVariableDefinition_content` or
  // `LuauSparkdownVariableDefinition_content`), which holds:
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
    `${nodeRef.node.name}_content`,
  );
  const targets: { name: string; assignNode: SyntaxNode; nameNode?: SyntaxNode }[] = [];
  const targetIdentifier = (t: (typeof targets)[number]) =>
    t.nameNode ? identifierAt(t.nameNode, ctx) : new Identifier(t.name);
  const trailingRhsGroups: SyntaxNode[][] = [];
  let sawAssignmentOp = false;
  let currentRhsGroup: SyntaxNode[] = [];
  // Statement nodes in the content (read after a comma, see
  // `TRAILING_STATEMENT_NAMES`) are adjacent statements, not RHS values.
  // Collect them into `trailingStatements` and lower them after the VA
  // below.
  const trailingStatements: SyntaxNode[] = [];
  // A comma no target or value has followed yet, so a comma with nothing
  // after it, or with a statement after it, can be reported.
  let unresolvedComma: SyntaxNode | null = null;
  let unresolvedAfterAssignment = false;

  if (contentNode) {
    let child = contentNode.firstChild;
    while (child) {
      if (isSkippableName(child.name)) {
        child = child.nextSibling;
        continue;
      }
      const pendingComma = unresolvedComma;
      unresolvedComma = null;
      if (child.name === "LuauVariableAssignment") {
        const opNode = ownAssignmentOperation(child);
        if (sawAssignmentOp) {
          if (opNode) {
            // A second `=` (`local a = 1, x = 99`): Luau ends the list at
            // `x` and cannot parse a statement that starts with `=`.
            validateSecondAssignment(opNode, ctx);
          } else {
            // A name after the `=` is a value: the grammar reads an
            // identifier before a comma or the end of the line as a
            // target-shaped assignment (`local a, g = 1, b`).
            currentRhsGroup.push(child);
          }
          child = child.nextSibling;
          continue;
        }
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
        if (opNode) sawAssignmentOp = true;
        child = child.nextSibling;
        continue;
      }
      if (isCommaName(child.name)) {
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        // Before the `=` the comma separates names, so an if expression
        // after it is the missing binding name Luau reports, not a value.
        const value = sawAssignmentOp ? commaLineBreakValue(child) : null;
        if (value) {
          currentRhsGroup.push(value);
        } else {
          unresolvedComma = child;
          unresolvedAfterAssignment = sawAssignmentOp;
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
      // An anonymous function directly after a comma is a value in the
      // list (`local a, g = 1, function() ... end`), not a statement:
      // treating it as one drops the slot and shifts every later value
      // one target left. A named one stays a trailing statement in a
      // `local`; in a `store` it is a value, which expression lowering
      // reports as a named function expression.
      if (
        child.name === "LuauFunctionDefinition" &&
        sawAssignmentOp &&
        (scope === "store" || !findOwnDeclarationName(child)) &&
        isCommaName(previousContentSibling(child)?.name)
      ) {
        currentRhsGroup.push(child);
        child = child.nextSibling;
        continue;
      }
      // Statement-like node. The grammar ends the definition at the
      // whitespace before a statement that follows it on the line, so a
      // statement node is here only when the definition's `LuauExpression`
      // read a declaration after a comma; it gets its own lowering pass
      // after the variable assignment.
      if (TRAILING_STATEMENT_NAMES.has(child.name)) {
        // Flush any partial RHS group first — `local a, b = 1 return x`
        // shouldn't be possible in valid Luau, but if it appears we
        // treat the RHS slot as complete and the statement as a
        // sibling.
        if (currentRhsGroup.length > 0) {
          trailingRhsGroups.push(currentRhsGroup);
          currentRhsGroup = [];
        }
        // A statement where the comma needs a value (`store a = 1, return`)
        // is Luau's missing-value error. A named function there stays a
        // lenient trailing statement (`AnonymousFunctionValueList.test.ts`).
        if (pendingComma && child.name !== "LuauFunctionDefinition") {
          validateListComma(pendingComma, unresolvedAfterAssignment, ctx);
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

  // A comma that ends the list: in Luau code the next line started with
  // something that is not a value (`end`, a statement), and in a narrative
  // body the declaration ended at its line. Luau reports the token it
  // found in place of the value or name. The same holds for a comma that
  // ends the last line continuing the declaration (`n` then `+ 4,`).
  const lastContinued = continuation.findLast((n) => !isSkippableName(n.name));
  // A value comma that ends the content, with lines carried after it: the
  // declaration ended at the start of an unindented line after the comma,
  // and the continuation holds the values that follow it, as Luau reads
  // them (`local a, g = 1,` then `2`).
  const valuesAfterComma =
    unresolvedComma != null &&
    unresolvedAfterAssignment &&
    trailingStatements.length === 0 &&
    lastContinued != null;
  if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (unresolvedComma && !valuesAfterComma) {
    validateListComma(unresolvedComma, unresolvedAfterAssignment, ctx);
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
  let firstRhsOp: SyntaxNode | undefined =
    ownAssignmentOperation(lastTarget.assignNode) ?? undefined;
  // The continuation's first comma group continues the last value; its
  // later groups are further values. After a comma that ends the content,
  // every group is a further value. When statements share the line after
  // the declaration, the continuation continues the last of them instead.
  const continuationGroups =
    trailingStatements.length > 0 ? [] : splitOnCommas(continuation);
  const [continued = [], ...continuedRhsGroups] = valuesAfterComma
    ? [[], ...continuationGroups]
    : continuationGroups;
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
  // A union that goes on past a comment line gives the value on its last
  // member line (`local v: number` then `-- note` then `| string = 1`).
  if (!firstRhsOp && !sawAssignmentOp) {
    firstRhsOp = typeUnionLineValue(nodeRef.node) ?? undefined;
  }
  if (firstRhsOp) {
    validateAssignmentValue(firstRhsOp, ctx, firstRhsContinuation.length > 0);
  }
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
  // multi-target const and multi-RHS const with an error on the
  // declaration; without it every read of the undeclared name is
  // silently nil.
  if (scope === "const") {
    if (targets.length > 1 || expressions.length > 1) {
      ctx.diagnostics?.push({
        message: "A `const` takes one name and one value",
        severity: ErrorType.Error,
        source: statementSource(nodeRef, ctx),
      });
    } else if (expressions.length === 0 && !sawAssignmentOp) {
      ctx.diagnostics?.push({
        message: "Missing initializer in const declaration",
        severity: ErrorType.Error,
        source: statementSource(nodeRef, ctx),
      });
    }
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
// and append the resulting ParsedObjects to the head list. The last of
// them is offered the declaration's continuation lines, which continue the
// line's last statement.
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

function previousContentSibling(node: SyntaxNode): SyntaxNode | null {
  let prev = node.prevSibling;
  while (prev && isSkippableName(prev.name)) prev = prev.prevSibling;
  return prev;
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

// A comma that ends its line is `LuauCommaLineBreak`, which also holds the
// line break and any comment before the next value.
function isCommaName(name: string | undefined): boolean {
  return name === "LuauCommaSeparator" || name === "LuauCommaLineBreak";
}

// The if expression a `LuauCommaLineBreak` holds after its line break, when
// the next line starts with one unindented (`local a, g = 1,` then `if c`):
// the declaration cannot read it there, so the comma does.
function commaLineBreakValue(comma: SyntaxNode): SyntaxNode | null {
  if (comma.name !== "LuauCommaLineBreak") return null;
  const content = comma.getChild("LuauCommaLineBreak_content");
  return content?.getChild("LuauTernaryExpression") ?? null;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "LuauLineComment" ||
    name === "LuauDocLineComment" ||
    name === "LuauBlockComment" ||
    name === "LuauTypeTrailingBlockComment" ||
    name === "LuauUncallableValueTrailingBlockComment" ||
    name === "LuauCallableValueTrailingBlockComment" ||
    name === "LuauTypeTrailingBlockCommentClose" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    VARIABLE_DEFINITION_BEGIN_NAMES.has(name) ||
    VARIABLE_DEFINITION_END_NAMES.has(name)
  );
}

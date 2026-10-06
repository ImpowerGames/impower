import { nodeNameSet } from "../../utils/nodeNameSet";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatForIn } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { shadowSiblingSubFlow } from "../expression/bindings";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { openBody, recordLoop } from "../utils/statementShape";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

// `for v1, v2, ... in iter_expr do BODY end` — Luau's generic-for.
//
// Lua's iterator protocol (Luau follows the same):
//   1. Evaluate `iter_expr` to (f, s, var).
//   2. Each iteration:
//        (v1, v2, ..., vn) = f(s, var)
//        if v1 == nil then break end
//        var = v1
//        BODY (with v1..vn in scope)
//
// A user-defined iterator may return ALL THREE values (`f, s, var`)
// or just ONE (`f`, a stateful closure). In the closure case `s` and
// `var` are nil and the closure ignores its args, using its captured
// state.
//
// Compiled shape:
//   BeginScope
//     local __iter_<off>, __state_<off>, __ctrl_<off> = <iter_expr>
//     - (__forIn_<off>_loop)
//       local v1, v2, ..., vn = __iter_<off>(__state_<off>, __ctrl_<off>)
//       { v1 == nil:
//         -> __forIn_<off>_break
//       }
//       __ctrl_<off> = v1
//       BODY (continue → -> __forIn_<off>_loop, break → -> __forIn_<off>_break)
//       -> __forIn_<off>_loop
//     - (__forIn_<off>_break)
//   EndScope
//
// `<off>` is `syntheticId`: the document tag, `$`, then the loop's offset in
// the document. The rename pass recognizes these names by that `$`.
//
// Limitations matching numeric/repeat:
//   - The loop variables (v1..vn) share their slots across iterations
//     instead of getting a fresh binding per iteration. Most user code
//     never observes this; closures captured inside the body that
//     depend on per-iteration slots would see all closures pointing
//     at the SAME slot (Luau gives each a fresh slot). Acceptable for
//     v1 of the iterator protocol.

const FOR_IN_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const FOR_NODES = nodeNameSet(["LuauForLoop", "LuauSparkdownForLoop", "LuauSparkdownExplicitLoop"]);

export function lowerLuauGenericForLoop(
  stat: AstStatForIn,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, FOR_NODES, ctx);
  if (!node) return {};
  const doBlock = findLoopDoBlock(node, ctx);
  // An EMPTY body (`for x in t do end`) has no `_content` child —
  // the loop must still lower (the iterand evaluates, and
  // `for x in 42 do end` must raise "attempt to iterate" through
  // pcall — iter.luau line 164). `lowerStatements(null)` yields [].
  const bodyContent = doBlock
    ? findChildByName(doBlock, `${doBlock.name}_content`)
    : null;
  if (!doBlock) return {};

  const loopVarNames = stat.vars.map((v) => v.name);
  if (loopVarNames.length === 0) return {};

  // The values after `in` are an EXPRESSION LIST: `f, s, var` — most
  // commonly a single call (`pairs(t)`, which returns the whole
  // triple) but Lua also allows the explicit form
  // `for k, v in next, t do` (basic.luau lines 253-258). The
  // MultiVariableAssignment below distributes them across (f, s, var)
  // with spread-last semantics (a single multi-return call still fills
  // all three slots).
  const iterExprs: Expression[] = [];
  for (const value of stat.values) {
    const e = lowerExpression(value, site.source, ctx);
    if (!e) return {};
    iterExprs.push(e);
  }
  if (iterExprs.length === 0) return {};

  const id = syntheticId(node.from, ctx);
  const iterName = `__forIn_${id}_iter`;
  const stateName = `__forIn_${id}_state`;
  const ctrlName = `__forIn_${id}_ctrl`;
  const loopLabel = `__forIn_${id}_loop`;
  const breakLabel = `__forIn_${id}_break`;

  // Init: pull (f, s, var) from the iterator expression list via a
  // multi-variable assignment with new-declaration semantics. A
  // single multi-return call (`pairs(t)`) spreads across all three
  // slots; explicit lists (`next, t`) fill positionally with nil
  // padding for the rest.
  const initTuple = new MultiVariableAssignment(
    [new Identifier(iterName), new Identifier(stateName), new Identifier(ctrlName)],
    iterExprs,
    /* isTemporaryNewDeclaration */ true,
  );

  // Luau iterand protocol (iter.luau "__iter" sections): when the
  // single iterand carries an `__iter` metamethod, its returns
  // replace the (f, s, ctrl) triple; a plain TABLE iterand iterates
  // implicitly (`for k, v in t do` ≡ pairs). The hidden stdlib entry
  // `__adjust_iter` (StdLib.ts) classifies at runtime — function
  // values and markers pass through unchanged.
  const adjustTuple = new MultiVariableAssignment(
    [new Identifier(iterName), new Identifier(stateName), new Identifier(ctrlName)],
    [
      new FunctionCall(new Identifier("__adjust_iter"), [
        new VariableReference([new Identifier(iterName)]),
        new VariableReference([new Identifier(stateName)]),
        new VariableReference([new Identifier(ctrlName)]),
      ]),
    ],
    /* isTemporaryNewDeclaration */ false,
  );

  // Push break/continue targets so the body's `break` / `continue`
  // emit diverts to the right label. The body runs inside the loop's
  // own scope wrap (see the `wrapInScope` in the return) — count it
  // in `scopeDepth` so `break`/`continue` inside nested scoped blocks
  // know how many EndScopes to emit before diverting.
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel: loopLabel,
    breakLabel,
    scopeDepth: ctx.scopeDepth,
  });
  const body = openBody(
    ctx,
    node.from,
    bodyContent?.from ?? doBlock.from,
    bodyContent?.to ?? doBlock.to,
  );
  // The loop's variables are locals of its body: each hides a variadic
  // function of its name there (`shadowSiblingSubFlow`), from a block of
  // their own that ends with the body.
  ctx.blockEndStack?.push([]);
  for (const name of loopVarNames) {
    shadowSiblingSubFlow(name, ctx);
  }
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    FOR_IN_BODY_SKIP,
    body,
  );
  ctx.blockEndStack?.pop()?.forEach((end) => end());
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  // Iteration step: call __iter(__state, __ctrl), unpack into the
  // user's loop variables. Declared as locals (re-set each iteration
  // in the same slot under the single-scope wrap).
  //
  // `CallValueExpression` (NOT ink's `FunctionCall`): the iterator is
  // a first-class VALUE — a closure, a builtin-iterator marker, or a
  // stdlib-fn marker like `next` in `for k in next, t do`. The
  // value-call op carries the call-site arg count, which the
  // `__stdlib_fn` dispatch needs to invoke VARIADIC entries (`next`
  // has arity -1; the divert-based FunctionCall path can't dispatch
  // those — basic.luau lines 253-258).
  const iterCall = new CallValueExpression(
    new VariableReference([new Identifier(iterName)]),
    [
      new VariableReference([new Identifier(stateName)]),
      new VariableReference([new Identifier(ctrlName)]),
    ],
  );
  const callAndUnpack = new MultiVariableAssignment(
    loopVarNames.map((n) => new Identifier(n)),
    [iterCall],
    /* isTemporaryNewDeclaration */ true,
  );

  // Termination check: `if first_loop_var == nil then -> break`.
  // Uses sparkdown's first-class `nil` (a `NullValue` at runtime).
  // Equality is special-cased in `NativeFunctionCall.Call` so that
  // `nil == nil` is true and `nil == <anything-else>` is false —
  // including `nil == 0`, which keeps a literal zero from
  // accidentally terminating the loop.
  const firstVarRef = new VariableReference([new Identifier(loopVarNames[0]!)]);
  const isNilCheck = new BinaryExpression(
    firstVarRef,
    new NullExpression(),
    "==",
  );
  const toBreak = new Divert([new Identifier(breakLabel)]);
  const breakBranch = new ConditionalSingleBranch([toBreak]);
  breakBranch.ownExpression = isNilCheck;
  breakBranch.isElse = false;
  const nilCheckConditional = new Conditional(null as never, [breakBranch]);

  // Control update: __ctrl = first_loop_var.
  const ctrlUpdate = new VariableAssignment({
    variableIdentifier: new Identifier(ctrlName),
    assignedExpression: new VariableReference([
      new Identifier(loopVarNames[0]!),
    ]),
  });

  const tailDivert = new Divert([new Identifier(loopLabel)]);

  // Assemble the loop body inside the loop gather.
  const loopGatherContents: ParsedObject[] = [
    callAndUnpack,
    nilCheckConditional,
    ctrlUpdate,
    ...bodyStatements,
    tailDivert,
  ];
  const loopGather = new Gather(new Identifier(loopLabel), 1);
  for (const c of loopGatherContents) loopGather.AddContent(c);

  const breakGather = new Gather(new Identifier(breakLabel), 1);

  const scoped = wrapInScope([initTuple, adjustTuple, loopGather, breakGather]);
  if (body) {
    recordLoop(scoped[0]!, {
      kind: "forIn",
      body,
      objects: scoped,
      test: breakBranch,
      init: [initTuple, adjustTuple],
      call: callAndUnpack,
      update: ctrlUpdate,
    }, [loopGather, breakGather, toBreak, tailDivert]);
  }
  return wrapInWeave(scoped);
}

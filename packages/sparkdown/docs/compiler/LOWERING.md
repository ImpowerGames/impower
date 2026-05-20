# Sparkdown Lowering Guide

The lowerer translates the **Lezer parse tree** (produced by the grammar — see [`GRAMMAR.md`](./GRAMMAR.md)) into the **inkjs `ParsedHierarchy`** that inkjs's `ExportRuntime` then converts to runtime bytecode. It's the layer that decides "what does this construct *mean*?" — every grammar node either becomes a `ParsedObject` of some kind, becomes part of a parent's ParsedObject, or is intentionally discarded.

If the grammar is "shape of the syntax," the lowerer is "shape of the runtime semantics." When they agree well, the lowerer is short and obvious. When they don't, the lowerer ends up doing parse-tree archaeology — which is a sign the grammar layer needs more structure (see [GRAMMAR.md §2 "Golden Rule"](./GRAMMAR.md#2-the-golden-rule)).

> **Companion docs:** [`GRAMMAR.md`](./GRAMMAR.md) covers the TextMate grammar layer. [`RUNTIME.md`](./RUNTIME.md) covers the bytecode interpreter.

---

## 1. Where the lowerer lives

```
packages/sparkdown/src/compiler/lower/
├── lower.ts                       # top-level dispatcher (the switch)
├── context.ts                     # LowerContext: read/lineNumber/characterNumber
├── lowerers/
│   ├── lowerScene.ts              # one file per node-name handler
│   ├── lowerBranch.ts
│   ├── lowerChoice.ts
│   ├── lowerDisplay.ts
│   ├── lowerDivert.ts
│   ├── lowerExplicitStatement.ts
│   ├── lowerImplicitAssignmentStatement.ts
│   ├── lowerLuauFunctionDefinition.ts
│   ├── lowerSparkdownIfBlock.ts
│   └── ...
├── expression/
│   ├── lowerExpression.ts         # value-expression lowering (Pratt parser)
│   ├── lowerTable.ts
│   └── ...
└── utils/
    ├── alternatorArms.ts          # shared arm-walking helper
    ├── lowerPropertyTargetAssignment.ts
    ├── wrapInWeave.ts
    ├── wrapInScope.ts
    ├── debugMetadata.ts
    └── ...
```

The pattern: **one file per grammar node-type** the lowerer handles. Files in `lowerers/` are leaves of the dispatch tree. Files in `utils/` are helpers shared across lowerers.

---

## 2. The dispatch loop

Everything routes through `lower.ts`:

```typescript
export function lower(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock | undefined {
  switch (nodeRef.name) {
    case "Scene":            return lowerScene(nodeRef, ctx);
    case "Branch":           return lowerBranch(nodeRef, ctx);
    case "Divert":
    case "ArmDivert":        return lowerDivert(nodeRef, ctx);
    case "LuauIfBlock":      return lowerLuauIfBlock(nodeRef, ctx);
    case "SparkdownIfBlock": return lowerSparkdownIfBlock(nodeRef, ctx);
    ...
  }
}
```

Two important conventions:

1. **A `case` returns `CompiledBlock | undefined`.** `undefined` means "I don't handle this node type, skip it." Returning `{}` means "I handle this but there's nothing to emit."
2. **Multiple node names can share a handler.** `Divert` and `ArmDivert` route to the same `lowerDivert` because they're structurally identical — only their grammar end boundaries differ. The lowerer doesn't care about the boundary; it just needs the parts.

After the switch, `lower.ts` stamps `DebugMetadata` on the returned objects so diagnostics can route back to source positions.

---

## 3. `CompiledBlock` and `Weave`

```typescript
export interface CompiledBlock {
  content?: ParsedObject[];
}
```

A `ParsedObject[]` is the standard return shape. The caller (usually `lowerStatements`) appends them into a parent body.

Many lowerers wrap their result in a `Weave`:

```typescript
import { wrapInWeave } from "../utils/wrapInWeave";

return wrapInWeave([variableAssignment]);
```

`Weave` is an inkjs construct that handles loose-end gathering and label-anchor resolution. For most statement-shaped lowerings, wrapping the single emitted object in a Weave is the right call. The caller's `appendBlockContent` then unwraps it back into the parent.

Don't wrap things that *are* already Weaves (`Choice` content lists, conditional branch bodies, etc.) — those have their own weave-handling.

---

## 4. The `LowerContext`

```typescript
export interface LowerContext {
  read: (from: number, to: number) => string;
  lineNumber: (pos: number) => number;
  characterNumber: (pos: number) => number;
  filePath?: string;
  config?: CompilationConfig;
}
```

Three things every lowerer uses:

- **`ctx.read(from, to)`** — pulls the source text between two positions. This is how you get the actual text of a name, number, string literal, etc.
- **`ctx.lineNumber(pos)`** / **`ctx.characterNumber(pos)`** — chunk-relative position for `DebugMetadata` stamping. Most lowerers don't need to call these directly because `lower.ts` stamps top-level objects automatically.
- **`ctx.filePath`** — used in diagnostics. Set automatically by the annotator.

The context is built from a CodeMirror `Text` object (when running inside the annotator) or from a raw string (when running snapshot tests). Both expose the same interface.

---

## 5. Walking the syntax tree

The grammar gives you `@lezer/common` `SyntaxNode`s. Useful operations:

```typescript
// First child / next sibling traversal:
let child = node.firstChild;
while (child) {
  // process child
  child = child.nextSibling;
}

// Find a named descendant:
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
const nameNode = getDescendent("LuauFunctionName", funcDefNode);
```

There are also `getDescendents` (plural, returns array), `getDescendentInsideParent` (bounded search), and `getNodesInsideParent`. They're in the same `utils/` directory.

### 5.0 Always type nodes as `GrammarSyntaxNode<SparkdownNodeName>`

The base `SyntaxNode` from `@lezer/common` types its `.name` field as `string`. That means a typo like `getDescendent("LuauFunctinName", node)` (note the missing `o`) compiles fine and silently returns `null` at runtime — and you spend an afternoon wondering why your lowerer doesn't see the name node.

The fix is the typed wrapper:

```typescript
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { type SparkdownNodeName } from "../types/SparkdownNodeName";

function lowerThing(
  node: GrammarSyntaxNode<SparkdownNodeName>,
  ctx: LowerContext,
) {
  // node.name is now typed as a union of all valid sparkdown rule names.
  // `getDescendent("...", node)` and `node.name === "..."` both get
  // compile-time autocomplete and typo-detection.
}
```

`SparkdownNodeName` is auto-derived from `keyof typeof GRAMMAR_DEFINITION.repository` in `src/compiler/types/SparkdownNodeName.ts`, so it stays in sync with the grammar JSON automatically. Every time you add or rename a rule and rebuild, the type updates.

Top-level lowerers already receive `SparkdownSyntaxNodeRef` (which contains a `GrammarSyntaxNode<SparkdownNodeName>` under `.node`) from the dispatcher. **Always preserve that typing as you pass nodes around** — when you write a helper, parameter, or local variable, use `GrammarSyntaxNode<SparkdownNodeName>` rather than the bare `SyntaxNode`. Don't widen back to `SyntaxNode` just because the helper "doesn't need the name."

Cast back to `SparkdownSyntaxNodeRef` when calling the dispatcher recursively:

```typescript
const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
```

The double cast is required because `SyntaxNode` (the parent type) doesn't structurally satisfy `SyntaxNodeRef` in TypeScript's eyes, even though the underlying object does. Centralizing this cast at the dispatcher boundary is fine; sprinkling it through helpers is a smell.

**Rule of thumb:** the only places that should mention bare `SyntaxNode` are (a) imports for the type, and (b) the dispatcher cast. Everywhere else, type as `GrammarSyntaxNode<SparkdownNodeName>`.

### 5.1 Prefer named captures over manual scans

If the grammar has already captured the name you want as a node, **use `getDescendent` to fetch it directly**. Don't scan children comparing strings to find it. The grammar made the name a node specifically so you wouldn't have to.

```typescript
// BAD — re-doing what the grammar already did
let nameNode: SyntaxNode | null = null;
let child = node.firstChild;
while (child) {
  if (/^[a-zA-Z_]\w*$/.test(ctx.read(child.from, child.to))) {
    nameNode = child;
    break;
  }
  child = child.nextSibling;
}

// GOOD — trust the grammar
const nameNode = getDescendent("LuauVariableName", node);
```

If you can't find a node-name to look up because the grammar didn't capture it as one, **fix the grammar first** (add the capture). Don't paper over a missing grammar node by inventing it in the lowerer.

### 5.2 Watch out for "skipped" nodes

A `patterns:`-only rule with no `emit: true` produces no tree node — its inner matches appear directly under the parent. That means `getDescendent("X", parent)` will descend through skipped wrappers transparently, which is *usually* what you want — but it also means you can't tell from a `getDescendent` result whether a wrapper was present.

When you need to know "is this child specifically X *at this position in the parent*?" check the child directly:

```typescript
const firstChild = node.firstChild;
if (firstChild?.name === "LuauFunctionCall") {
  // first immediate child is a function call
}
```

---

## 6. Order of dispatch matters too

Most lowerers walk a parent's children with `lowerStatements`:

```typescript
export function lowerStatements(
  parent: SyntaxNode | null,
  ctx: LowerContext,
  skipNames: ReadonlySet<string> = new Set(),
): ParsedObject[] {
  const result: ParsedObject[] = [];
  let child = parent.firstChild;
  while (child) {
    if (!skipNames.has(child.name)) {
      // Implicit assignment: detect a LuauAccessPath followed by a
      // sibling LuauAssignmentOperation (Lua's "suffixed expression then =" rule)
      if (child.name === "LuauAccessPath") {
        const opSibling = findAssignmentOperationAfter(child);
        if (opSibling) {
          const block = lowerImplicitAssignmentStatement(child, opSibling, ctx);
          appendBlockContent(result, block);
          child = opSibling.nextSibling;
          continue;
        }
      }
      const block = lower(child as SparkdownSyntaxNodeRef, ctx);
      if (block?.content) {
        appendBlockContent(result, block);
      }
    }
    child = child.nextSibling;
  }
  return result;
}
```

Two patterns worth noting:

- **`skipNames`** is the standard way for a parent lowerer to say "I've already handled these specific sub-nodes; don't recurse into them via `lower()`." The if-block lowerer uses this to skip `LuauIfBlockCondition`, `LuauElseifBlock`, `LuauElseBlock` — it handles those itself.
- **Sibling-pair detection** — when grammar nodes can't be a single rule but only make sense paired (here: `LuauAccessPath` + sibling `LuauAssignmentOperation`), do the pairing at the lowerer level. This mirrors Lua's recursive-descent: parse a suffixed expression, then decide based on what follows. Avoid encoding it in the grammar via complex lookaheads.

---

## 7. Lowering expressions

Expressions go through their own machinery in `expression/lowerExpression.ts`. The two top-level entry points:

```typescript
// Lower an expression from a SyntaxNode that contains the expression as a child.
// Use this when the grammar wrapper contains the expression node(s).
lowerExpressionFromContainer(container: SyntaxNode, ctx: LowerContext): Expression | null

// Lower an expression from a flat list of sibling nodes.
// Use this when you've already extracted the relevant child range.
lowerExpressionFromNodes(nodes: SyntaxNode[], ctx: LowerContext): Expression | null
```

These walk a Pratt-style operator-precedence parser over the tokens. There's a `PRIMARY_NODES` set (numbers, strings, identifiers, parenthesized expressions, tables, etc.) and a `BINARY_OPS` table for operator precedence.

For most lowerers you only need the entry points; you'll rarely modify the Pratt parser itself. If you're adding a new binary operator or primary literal:

1. Add the token to the grammar with a clear node name.
2. Add the node name to `PRIMARY_NODES` (for primaries) or to the `BINARY_OPS` precedence table (for operators).
3. If a new primary type needs special handling, add a case in `lowerPrimary`.

---

## 8. Three layers of "what to do with a node"

1. **Emit a `ParsedObject`** — the node maps to a runtime construct. Most lowerers.
2. **Be consumed by a parent** — the node is structural metadata for its parent (`Scene_begin`, `LuauIfBlockCondition`, capture nodes). The parent reads its content but doesn't emit anything separate for it.
3. **Be ignored** — comments, whitespace, decorative tokens. The dispatcher returns `undefined` so `lowerStatements` skips it.

When adding a new node-type handler, decide which category it falls into. Don't emit something just because you can — empty emissions clutter the runtime tree and add noise to bytecode.

---

## 9. Worked example: adding an `& fn(args)` discard call

To illustrate the layering, here's how the existing discard-call statement got built:

**Grammar** — captures `&` + access-path:

```yaml
LuauExplicitStatement:
  begin: ({{WS}}*)([&])($|{{WS}}+)
  beginCaptures:
    1: { patterns: [{ include: "#Indent" }] }
    2: { patterns: [{ include: "#LuauExplicitStatementMark" }] }
    3: { patterns: [{ include: "#Separator" }] }
  patterns:
    - { include: "#LuauImplicitStatement" }
    - { include: "#LuauExpression" }
    - { include: "#ExtraWhitespace" }
  end: (?={{BEAT}})|$
```

The grammar produces a `LuauExplicitStatement` node containing a `LuauAccessPath` (the call path).

**Lowerer** — `lowerExplicitStatement.ts`:

```typescript
// Bare function-call statement (no assignment operator).
// Lower the access path as an expression; if it's a FunctionCall,
// set shouldPopReturnedValue and emit it.
if (!opNode) {
  const callExpr = lowerExpressionFromNodes([lhsPath], ctx);
  if (callExpr instanceof FunctionCall) {
    callExpr.shouldPopReturnedValue = true;
    return wrapInWeave([callExpr]);
  }
  return {};
}
```

`shouldPopReturnedValue = true` is the runtime's "evaluate the call but throw away the result" flag.

**Dispatcher** wiring (already present):

```typescript
case "LuauExplicitStatement":
  return lowerExplicitStatement(nodeRef, ctx);
```

That's the full vertical slice: grammar → lowerer → runtime flag. Each layer does one thing; the layers communicate through node names and ParsedObject classes.

---

## 10. Lowerer design rules

### 10.1 Look at the node, not at its parents

If a lowerer needs to know "what context am I in?" to decide what to emit, that's a smell. The dispatcher routes by node *name*; if the same node-name needs different lowering in different contexts, **the grammar should emit different node names**.

Real example: alternator arms come in `LuauSparkdownAlternatorArm` (block form, expects display lines) and `LuauSparkdownInlineGluedAlternatorArm` (inline form, expects glued text). Two grammar rules → two lowerer dispatches → no context-sensing.

### 10.2 Keep one file per node-type

One file per top-level node-type handler. Shared utilities go in `utils/`. Don't bundle `lowerScene` and `lowerBranch` together "because they're similar" — the similarity belongs in a `utils/lowerFlowBase.ts` helper they both call.

### 10.3 Wrap in `Weave` for statement-shaped things

If your lowerer emits a single ParsedObject for a statement, `wrapInWeave` is almost always right. The caller's `appendBlockContent` unwraps one level. The Weave wrapper exists so inkjs's gather/label resolution can run uniformly.

### 10.4 Wrap blocks in `wrapInScope`

For block bodies that introduce a lexical scope (`if`, `for`, `while`, `do`), wrap the lowered body in `BeginScope` / `EndScope` control commands via `wrapInScope`:

```typescript
import { wrapInScope } from "../utils/wrapInScope";

const body = wrapInScope(lowerStatements(content, ctx, skipNames));
```

This tells the runtime to push/pop a temporary-variable scope frame so `local x` inside the block doesn't leak. Forgetting this is a common bug.

### 10.5 Stamp `DebugMetadata` once

`lower.ts` stamps debug metadata on the top-level returned objects automatically. Don't re-stamp inside individual lowerers unless you need *finer-grained* metadata on a sub-object (e.g. the inner `Identifier` of an assignment so the diagnostic can point at the name, not the whole statement). The helper `stampDebugMetadata` skips objects that already have metadata, so finer-grained stamping is additive.

### 10.6 Empty bodies still need to be valid

A function body, branch body, or block body with no content should still parse and lower without error. The lowerer should always return a valid (possibly empty) ParsedObject tree, never throw on empty input. Test with empty fixtures.

---

## 11. Debugging the lowerer

### 11.1 Snapshot tests

`src/tests/compiler/compileSnapshot.test.ts` walks `src/tests/compiler/__snapshots__/compile/**` and snapshots the **lowered ParsedHierarchy JSON** (the input to inkjs's `ExportRuntime`). When you change a lowerer, these are the tests that catch regressions.

Reading a failing compile snapshot diff requires familiarity with the inkjs ParsedObject vocabulary (`VariableAssignment`, `FunctionCall`, `Conditional`, `Divert`, etc.). The same advice as grammar snapshots applies: **read the diff**. Don't reflexively regenerate.

### 11.2 Runtime tests are the final answer

Lowerer behavior is most testable end-to-end via the runtime:

```typescript
const ctx = makeRuntimeStoryFromSource(`& count(2)
-> DONE
function count(n)
  if n > 0 then
    & count(n - 1)
  end
end
`);
expect(ctx.errorMessages).toEqual([]);
expect(ctx.story.ContinueMaximally()).toBe("");
```

If a runtime test fails, the failure is usually visible in:

1. **The grammar tree** (`dumpTree`) — is the structure what you expected?
2. **The lowered hierarchy** (`compileSnapshot.test.ts`) — does the lowered shape do what you want?
3. **The bytecode** (`ctx.story.ToJson()`) — is the final emit correct?

Inspect them in that order. The bug is almost always at the lowest level that doesn't match your mental model.

### 11.3 Dumping bytecode for a specific test

A useful one-off debug pattern (used in this project's investigation work):

```typescript
const ctx = makeRuntimeStoryFromSource(src);
console.log(JSON.stringify(JSON.parse(ctx.story.ToJson()).root, null, 2));
```

You'll see the runtime container structure: `ev`/`/ev` for eval sections, `out` for outputs, `VAR?`/`VAR=` for variable ops, `f()` for function calls, conditional containers, etc. See [`RUNTIME.md`](./RUNTIME.md) for the bytecode vocabulary.

---

## 12. Adding a new lowerer: checklist

1. **Confirm the grammar is right** with `dumpTree`. The tree should show exactly the structure you want to lower.
2. **Decide whether the new node** maps to:
   - One ParsedObject → write a lowerer, add a `case`, return `wrapInWeave([obj])`.
   - Part of a parent's ParsedObject → the parent's lowerer should walk to it via `getDescendent` and consume its content.
   - Nothing → add `case "Foo": return {};` if it might come up in `lowerStatements`, otherwise omit.
3. **Reuse helpers** from `utils/`. `lowerPropertyTargetAssignment`, `wrapInWeave`, `wrapInScope`, `findChildByName`, etc.
4. **Write a snapshot fixture** under `src/tests/compiler/__snapshots__/compile/<category>/<name>.sd` for compile output. Snapshot the lowered JSON.
5. **Write a runtime test** under `src/tests/runtime/<Category>.test.ts` that exercises the behavior end-to-end.
6. **Verify** with `dumpTree` + bytecode inspection that the actual emit matches expectations. Don't trust passing tests if the bytecode isn't what you intended — they may be passing for the wrong reason.

---

## 13. Pitfalls

- **Typing nodes as `SyntaxNode` instead of `GrammarSyntaxNode<SparkdownNodeName>`.** The bare `SyntaxNode.name` is `string`, so typos in node names compile fine and return `null` at runtime. Always use the typed wrapper (see §5.0).
- **Reading what should be a sub-tree as a flat text range.** If you find yourself doing `ctx.read(node.from, node.to)` and parsing the result, the grammar should have already structured it.
- **Forgetting to handle the no-content case.** Empty bodies, empty parameter lists, empty conditional branches.
- **Forgetting `wrapInWeave` on a single-object emission.** The parent's `appendBlockContent` expects to find a Weave to unwrap.
- **Forgetting `wrapInScope` on block bodies.** `local` declarations leak out of the block at runtime.
- **Re-implementing the dispatcher.** If you find yourself doing `if (child.name === "Foo") lowerFoo(child) else if (child.name === "Bar") ...`, call `lower(child, ctx)` and let the central dispatch handle it.
- **Lowering at parent depth what should be lowered at child depth.** If lowering "function definition" walks its `if` body and recurses into individual statements, you've inlined the if-block handler. Let `lowerStatements` recurse — the dispatcher handles the `if` via `lower()`.
- **Stamping debug metadata on every object.** Don't fight `lower.ts`'s automatic top-level stamping. Only add metadata if you need finer-grained source positions on a sub-object.

---

## 14. Useful files to read

- `src/compiler/lower/lower.ts` — the dispatcher and `lowerStatements`.
- `src/compiler/lower/context.ts` — the `LowerContext` and how it's built.
- `src/compiler/lower/utils/wrapInWeave.ts`, `wrapInScope.ts` — the two most common wrappers.
- `src/compiler/lower/expression/lowerExpression.ts` — Pratt parser for value expressions.
- `src/compiler/lower/lowerers/lowerScene.ts`, `lowerBranch.ts` — flow-base lowering (good starting examples).
- `src/compiler/lower/lowerers/lowerSparkdownIfBlock.ts` — block-with-scopes, multiple body sections.
- `src/compiler/lower/lowerers/lowerExplicitStatement.ts` — statement dispatch with sub-form routing.
- `src/compiler/lower/utils/lowerPropertyTargetAssignment.ts` — non-trivial expression target lowering.
- `src/inkjs/compiler/Parser/ParsedHierarchy/` — the inkjs ParsedObject classes the lowerer produces.

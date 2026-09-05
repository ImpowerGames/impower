# Closed value sets and where the type system enforces them

A value with an exact, machine-derivable set of legal values should be typed with that set, so that a stale literal is a compile error rather than a comparison that silently never matches. This page records where that protection exists, how it works, where it deliberately stops and a script takes over, and what it would take to extend it to the other closed sets in the repository.

## Grammar node names

`SparkdownNodeName` (`packages/sparkdown/src/compiler/types/SparkdownNodeName.ts`) is derived from the generated grammar `packages/sparkdown/language/sparkdown.language-grammar.json`: the root rule and every repository rule, each with its `_begin`, `_content` and `_end` variants, the `NodeID` keys, and the two synthetic error nodes. The grammar JSON is regenerated from `definitions/yaml/sparkdown.language-grammar.yaml` into that file and into `vscode-sparkdown/language/`, so a rule rename propagates into the type automatically. Capture-index names such as `Foo_c2` are deliberately not part of the union; see `packages/textmate-grammar-tree/src/grammar/types/NodeName.ts`.

### What `tsc` checks

The check applies wherever the value being compared carries the union:

- A comparison or `switch` on a node typed `GrammarSyntaxNode<SparkdownNodeName>` or `SparkdownSyntaxNodeRef`, including `.name` and `.type.name`. The lowerers under `packages/sparkdown/src/compiler/lower/` receive a `SparkdownSyntaxNodeRef`, whose `node` is typed, so lookups from `nodeRef.node` are checked; only the walks they make through lezer's own `firstChild`, `nextSibling` and `parent` are not.
- A lookup through the tree helpers in `packages/textmate-grammar-tree/src/tree/utils/` (`getDescendent`, `getDescendents`, `getDescendentInsideParent`, `getDescendentsInsideParent`, `getNodesInsideParent`, `getOtherNodesInsideParent`, `getOtherMatchesInsideParent`) whose parent node or stack is typed with the union.
- A constant set or array of names declared with the union: `nodeNameSet([...])` from `packages/sparkdown/src/compiler/utils/nodeNameSet.ts`, or `const NAMES: SparkdownNodeName[] = [...]`. The helper checks its argument against the union and returns a `Set<string>`, so `has` still accepts the `string`-typed name of a bare lezer node. Every constant set of node names in the compiler, the language server and the VS Code extension goes through it; a new one should too.

The helpers are generic over two parameters: `N`, the grammar's name set, inferred from the parent node or the stack, and `T extends N`, the name or names being looked up. Keeping them separate is what makes the check work. A helper written as `<T extends string>(name: T, stack: GrammarSyntaxNode<T>[])` infers `T` from every argument at once, and because both the literal and the union are string-literal types TypeScript unions them instead of comparing them, so `getDescendentInsideParent("NotARule", "Divert", stack)` compiles. Do not write a new helper or wrapper in that shape.

`GrammarSyntaxNode<N, T>` carries the grammar's set on `type.name` and the node's own name on `name`. A helper narrows `name` to what it searched for and keeps `type.name` as the full set, so a node returned by one lookup can be the parent of the next and still be checked.

A wrapper that takes a stack should declare it as `GrammarSyntaxNode<SparkdownNodeName>[]`, not as a generic; `packages/sparkdown-language-server/src/utils/syntax/getParentSectionPath.ts` is the pattern. A lezer sibling or parent obtained through `prevSibling`, `nextSibling` or `parent` is a plain `SyntaxNode`; cast it to `GrammarSyntaxNode<SparkdownNodeName>` when the walk compares names, as that file does.

`packages/sparkdown-language-server/src/tests/types/nodeNameTyping.typecheck.ts` pins all of this. It is compiled by the typecheck gate and never run: each `@ts-expect-error` line asserts that a stale name is rejected in one of the shapes above, so a refactor that loosens the helpers or the node type fails the gate.

### What `tsc` cannot see

Some shapes carry no type information, and a stale name in any of them compiles:

- A lookup whose parent is a bare lezer `SyntaxNode`. The helper infers `N` as `string`. This includes the compiler's local child finders (`findChildByName`, `findChild`, `directChild`), which take `(parent: SyntaxNode, name: string)`.
- lezer's own `node.getChild("...")` and `node.getChildren("...")`, typed as `string`.
- A comparison on a `.name` typed `string` or `any`, an inline array's `.includes(node.name)`, and the `case` labels of a `switch` on such a name.
- A `new Set([...])` of names that was not declared with the union.

`scripts/check-node-names.mjs` covers those. It derives the same legal set as the type (`legalNames` in `scripts/node-names.mjs`), scans every tracked TypeScript file that can reach the tree (one importing a tree helper, `SparkdownNodeName`, `SparkdownSyntaxNodeRef`, or lezer's `SyntaxNode`, or walking from a tree's `topNode`), strips comments and skips string and regex bodies, and reports each literal in one of the positions above that the grammar cannot produce. It also fails when the two generated grammar copies declare different rules, which means one was regenerated without the other. The Typecheck workflow runs `node --test scripts/check-node-names.test.mjs` and then `npm run check:node-names` before `tsc`. A line that compares a `.name` which is not a node name opts out with a `// not a node name` comment on the line the finding names. The ink engine under `packages/sparkdown/src/inkjs/` compares native-function names and is skipped, as are the grammar-agnostic `textmate-grammar-tree` and `codemirror-vscode-language` packages and one incremental-parse spike that builds its own node set.

Outside both: a name held in a constant other than a set (a plain string variable, an object key used as a dispatch table) and compared later. Declare such values with the union.

### Audit record

The state of every bypass found while closing this, as of the branch that landed the checks (`refactor/438-grammar-name-typing`, from `e598da8ad`). Lines refer to that base commit.

| Site | Names | Disposition |
| --- | --- | --- |
| `packages/sparkdown-language-server/src/utils/syntax/getParentSectionPath.ts:14,52,62` and the lookups at `:15,53,65` | `Function`, `Knot`, `Stitch`, `FunctionDeclarationName`, `KnotDeclarationName`, `StitchDeclarationName` | Deleted. The branches were unreachable; the path is the enclosing `scene.branch`, matching `getDeclarationScopes`. Stack typed with the union. |
| `packages/sparkdown-language-server/src/utils/syntax/getParentPropertyPath.ts` | eighteen `*StructObjectItem*` and `*StructObjectProperty*` names | File deleted; it had no importers. |
| `packages/sparkdown/src/compiler/lower/expression/lowerExpression.ts:1312,1440` | `LuauGenericForLoop` | Deleted. Numeric and generic loops are both `LuauForLoop`. |
| `packages/sparkdown-document-views/src/modules/screenplay-preview/utils/screenplayFormatting.ts:455` | `Indent` | Deleted, with the comments that described the node. Parameter typed with the union. |
| `packages/sparkdown-language-server/src/utils/providers/getDocumentFormattingEdits.ts:1243,1246` | `LuauFunctionReturnTypeAnnotation`, `LuauMethodDeclarationName` | Fixed to `LuauFunctionReturnType`; the method name is in the `_begin` capture and needed no entry. An empty function with a return type now compacts like one without; pinned by `src/tests/formatter/emptyBlockSignature.test.ts`. |
| `vscode-sparkdown/src/context/ContextServiceEditorInTextSymbol.ts:39` | `IndentingColon` | Deleted from the list, which is now typed with the union. |
| `packages/sparkdown-language-server/src/utils/providers/getCompletions.ts:913,1078` | declaration kinds `list`, `temp`, `knot`, `stitch` | Deleted; the lists are `DeclarationType[]`. |
| `packages/sparkdown/src/compiler/classes/SparkdownCompiler.ts:3350,3385,3406` | `global decl` | Left. These compare ink flow names, not node names, and carry the opt-out comment. |
| 115 `new Set([...])` constants across 25 files in the compiler, the language server and the extension | node names | Left in place, built with `nodeNameSet(...)` so `tsc` checks them. One set in `lowerSparkdownIfBlock.ts` mixes a literal with computed names and stays a plain set; the script checks its literal. |
| Lookups through bare `SyntaxNode` parents throughout `packages/sparkdown/src/compiler/lower/` and the nine local child finders | node names | Left. Covered by the script rather than the type; retyping every walk is not worth the churn. |

## Other closed value sets

The sets below have an exact legal set but travel at least partly as bare strings. Each entry says whether a derived union is worth introducing and roughly what it costs.

### Declaration kinds

`DeclarationType` in `packages/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator.ts` is the union, and it is carried end to end: the annotator marks with it, `getDeclarationScopes` returns `DeclarationScopes`, whose per-scope records are keyed by it, and the completion provider's kind lists are typed `DeclarationType[]`. Nothing further to do; a kind removed from the annotator is a compile error in the completion provider.

### Editor pane and panel names

`PaneType` and `PanelType` exist in `packages/spark-editor-protocol/src/types/workspace/WorkspaceCache.ts` and type the workspace cache. The `window/*` message parameters do not use them: `DidOpenPaneParams`, `DidOpenPanelParams`, `DidOpenViewParams`, `DidOpenFileEditorParams` and `DidCloseFileEditorParams` declare `pane: string` and `panel: string`. Recommendation: change those fields to `PaneType` and `PanelType`. Cost: five message files plus whichever senders in `impower-dev/src/modules/spark-editor/` then need a cast removed or a literal fixed; an afternoon. Benefit: renaming a pane becomes an error at the message boundary instead of an event nobody handles.

### Protocol method names

Each message class in `spark-editor-protocol` declares `static readonly method = "…"` and exports `XMethod = typeof X.method`, so the method is a literal type wherever the class is used, and the `isNotification`, `isRequest` and `isProgressResponse` helpers take that typed method. The one bare comparison outside the package, in `impower-dev/src/modules/spark-editor/workspace/WorkspacePrint.ts`, compares `type.method` where `type` is a typed request, so it is checked. The game engine has a second message family of the same shape under `packages/spark-engine/src/game/core/classes/messages/`, and its tests (`GameStep.test.ts`, `audioOutput.test.ts`) compare recorded messages against `"game/executed"`-style literals through a local `{ method: string }` record type; a renamed message there makes the lookup return nothing and the assertion fail loudly, so the cost of the bare string is a confusing failure rather than a silent one. Recommendation: nothing now for the protocol; type the test records' `method` with `typeof GameExecutedMessage.method` and its siblings if those tests grow. If a dispatch table keyed by method string is ever introduced in either family, derive its key type from the message classes rather than writing the strings again.

### Asset and struct type names

Two sets overlap here. File-derived asset types are listed in `ASSET_TYPES` inside `SparkdownCompiler.ts` (`image`, `audio`, `font`, `video`, `filtered_image`) and compared as `$type === "image"` in about fifteen places across the compiler, the language server and the engine, with `kind: "image" | "audio"` written out in two more. Struct type names are the keys of the builtin definition registries (`coreBuiltinDefinitions` in `packages/spark-engine/src/game/core/` and the per-module equivalents), so `keyof` those registries is a derivable union.

A union at the comparison sites is blocked by the shape of the data: `program.context` and the runtime struct values are typed as records of `any`, so `$type` is `string` or `any` wherever it is read, and a union on the literal side would check nothing. Typing `$type` first means typing the context, which is the larger change tracked by the runtime-objects direction. Recommendation: extend the check script rather than the types, with a second legal set derived from the builtin registries and the `ASSET_TYPES` list, applied to `$type === "…"` literals. Cost: a day, most of it deciding which registry files are the source of truth. Leave the union until the context is typed.

### CSS property names in the Sparkle style transformer

`STYLE_TRANSFORMERS` in `packages/sparkle-style-transformer/src/constants/` is an object literal keyed by property name, so `keyof typeof STYLE_TRANSFORMERS` is available with no data change. The names arrive at runtime from user-written style blocks, so a union cannot check the input; it can check the two alias tables, `STYLE_ALIASES` and `CSS_ALIASES`, whose values name transformer keys and would silently stop working if a transformer were renamed. One already has: `CSS_ALIASES` maps `clip-path` to `clip`, and there is no `clip` transformer. Recommendation: declare a `StylePropertyName` union from the transformer keys and mark both alias tables `satisfies Record<string, StylePropertyName>`, which surfaces that alias on the first compile. Cost: an hour.

## Type or script

A derived union is the right tool when the value is compared on objects whose types already reach the comparison site. A check script is the right tool when the value is read out of loosely typed data (`any`, `Record<string, any>`, JSON), when it crosses a boundary that erases the type (a message payload, a worker, a generated file), or when the comparison sits on lezer's own untyped API. The node-name script is the template for the second case: derive the legal set from the same source the type would use, scan only the files that can hold the value, test the scanner so its own coverage cannot narrow unnoticed, and fail the typecheck workflow.

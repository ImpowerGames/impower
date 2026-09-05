# Closed value sets and where the type system enforces them

A value with an exact, machine-derivable set of legal values should be typed with that set, so that a stale literal is a compile error rather than a comparison that silently never matches. This page records where that protection exists, how it works, where it deliberately stops and a script takes over, and what it would take to extend it to the other closed sets in the repository.

## Grammar node names

`SparkdownNodeName` (`packages/sparkdown/src/compiler/types/SparkdownNodeName.ts`) is derived from the generated grammar `packages/sparkdown/language/sparkdown.language-grammar.json`: every repository rule, its `_begin`, `_content` and `_end` variants, the `NodeID` keys, and the two synthetic error nodes. The grammar JSON is regenerated from `definitions/yaml/sparkdown.language-grammar.yaml`, so a rule rename propagates into the type automatically. Capture-index names such as `Foo_c2` are deliberately not part of the union; see `packages/textmate-grammar-tree/src/grammar/types/NodeName.ts`.

### What `tsc` checks

The check applies wherever the value being compared carries the union:

- A comparison or `switch` on a node typed `GrammarSyntaxNode<SparkdownNodeName>` or `SparkdownSyntaxNodeRef`, including `.name` and `.type.name`.
- A lookup through the tree helpers in `packages/textmate-grammar-tree/src/tree/utils/` (`getDescendent`, `getDescendents`, `getDescendentInsideParent`, `getDescendentsInsideParent`, `getNodesInsideParent`, `getOtherNodesInsideParent`, `getOtherMatchesInsideParent`) whose parent node or stack is typed with the union.

The helpers are generic over two parameters: `N`, the grammar's name set, inferred from the parent node or the stack, and `T extends N`, the name or names being looked up. Keeping them separate is what makes the check work. A helper written as `<T extends string>(name: T, stack: GrammarSyntaxNode<T>[])` infers `T` from every argument at once, and because both the literal and the union are string-literal types TypeScript unions them instead of comparing them, so `getDescendentInsideParent("NotARule", "Divert", stack)` compiles. Do not write a new helper or wrapper in that shape.

`GrammarSyntaxNode<N, T>` carries the grammar's set on `type.name` and the node's own name on `name`. A helper narrows `name` to what it searched for and keeps `type.name` as the full set, so a node returned by one lookup can be the parent of the next and still be checked.

A wrapper that takes a stack should declare it as `GrammarSyntaxNode<SparkdownNodeName>[]`, not as a generic; `packages/sparkdown-language-server/src/utils/syntax/getParentSectionPath.ts` is the pattern. A lezer sibling or parent obtained through `prevSibling`, `nextSibling` or `parent` is a plain `SyntaxNode`; cast it to `GrammarSyntaxNode<SparkdownNodeName>` when the walk compares names, as that file does.

### What `tsc` cannot see

Three shapes carry no type information, and a stale name in any of them compiles:

- A lookup whose parent is a bare lezer `SyntaxNode`. The helper infers `N` as `string`. Most of the lowerers under `packages/sparkdown/src/compiler/lower/` walk with plain `SyntaxNode` values.
- lezer's own `node.getChild("...")` and `node.getChildren("...")`, typed as `string`.
- A comparison on a `.name` typed `string` or `any`, and the `case` labels of a `switch` on such a name.

`scripts/check-node-names.mjs` covers those. It derives the same legal set as the type, scans every tracked TypeScript file that imports a tree helper, `SparkdownNodeName` or `SparkdownSyntaxNodeRef`, and reports each string literal in one of the positions above that the grammar cannot produce. The Typecheck workflow runs it after `tsc` (`npm run check:node-names`). A line that compares a `.name` which is not a node name opts out with a trailing `// not a node name` comment. The ink engine under `packages/sparkdown/src/inkjs/` compares native-function names and is skipped, as is the grammar-agnostic `textmate-grammar-tree` package.

## Other closed value sets

The sets below have an exact legal set but travel at least partly as bare strings. Each entry says whether a derived union is worth introducing and roughly what it costs.

### Declaration kinds

`DeclarationType` in `packages/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator.ts` is the union, and it is carried end to end: the annotator marks with it, `getDeclarationScopes` returns `DeclarationScopes`, whose per-scope records are keyed by it, and the completion provider's kind lists are typed `DeclarationType[]`. Nothing further to do; a kind removed from the annotator is a compile error in the completion provider.

### Editor pane and panel names

`PaneType` and `PanelType` exist in `packages/spark-editor-protocol/src/types/workspace/WorkspaceCache.ts` and type the workspace cache. The `window/*` message parameters do not use them: `DidOpenPaneParams`, `DidOpenPanelParams`, `DidOpenViewParams`, `DidOpenFileEditorParams` and `DidCloseFileEditorParams` declare `pane: string` and `panel: string`. Recommendation: change those fields to `PaneType` and `PanelType`. Cost: five message files plus whichever senders in `impower-dev/src/modules/spark-editor/` then need a cast removed or a literal fixed; an afternoon. Benefit: renaming a pane becomes an error at the message boundary instead of an event nobody handles.

### Protocol method names

Each message class declares `static readonly method = "…"` and exports `XMethod = typeof X.method`, so the method is a literal type wherever the class is used, and the `isNotification`, `isRequest` and `isProgressResponse` helpers take that typed method. The one bare comparison outside the protocol package, in `impower-dev/src/modules/spark-editor/workspace/WorkspacePrint.ts`, compares `type.method` where `type` is a typed request, so it is checked. Recommendation: nothing now. If a dispatch table keyed by method string is ever introduced, derive its key type from the protocol classes rather than writing the strings again.

### Asset and struct type names

Two sets overlap here. File-derived asset types are listed in `ASSET_TYPES` inside `SparkdownCompiler.ts` (`image`, `audio`, `font`, `video`, `filtered_image`) and compared as `$type === "image"` in about fifteen places across the compiler, the language server and the engine, with `kind: "image" | "audio"` written out in two more. Struct type names are the keys of the builtin definition registries (`coreBuiltinDefinitions` in `packages/spark-engine/src/game/core/` and the per-module equivalents), so `keyof` those registries is a derivable union.

A union at the comparison sites is blocked by the shape of the data: `program.context` and the runtime struct values are typed as records of `any`, so `$type` is `string` or `any` wherever it is read, and a union on the literal side would check nothing. Typing `$type` first means typing the context, which is the larger change tracked by the runtime-objects direction. Recommendation: extend the check script rather than the types, with a second legal set derived from the builtin registries and the `ASSET_TYPES` list, applied to `$type === "…"` literals. Cost: a day, most of it deciding which registry files are the source of truth. Leave the union until the context is typed.

### CSS property names in the Sparkle style transformer

`STYLE_TRANSFORMERS` in `packages/sparkle-style-transformer/src/constants/` is an object literal keyed by property name, so `keyof typeof STYLE_TRANSFORMERS` is available with no data change. The names arrive at runtime from user-written style blocks, so a union cannot check the input; it can check the two alias tables, `STYLE_ALIASES` and `CSS_ALIASES`, whose values name transformer keys and would silently stop working if a transformer were renamed. Recommendation: declare a `StylePropertyName` union from the transformer keys and mark both alias tables `satisfies Record<string, StylePropertyName>`. Cost: an hour. Benefit: an alias pointing at a transformer that no longer exists is a compile error.

## Type or script

A derived union is the right tool when the value is compared on objects whose types already reach the comparison site. A check script is the right tool when the value is read out of loosely typed data (`any`, `Record<string, any>`, JSON), when it crosses a boundary that erases the type (a message payload, a worker, a generated file), or when the comparison sits on lezer's own untyped API. The node-name script is the template for the second case: derive the legal set from the same source the type would use, scan only the files that can hold the value, and fail the typecheck workflow.

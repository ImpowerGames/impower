# Lints

A lint is a warning about code that compiles but is almost certainly not what the author meant: a local that is never read, a statement no path reaches, the same condition checked twice. Sparkdown's lints for Luau code follow the rules of Luau's own linter, with Luau's messages, and each carries the rule's name as its diagnostic `code`.

The rules are in `src/compiler/lint/collectLuauLints.ts`, and the compiler reports them from `validateLints` on every compile. The specification is Luau's linter test file, `tests/Linter.test.cpp`, ported to `src/tests/luau-conformance/Lint*.test.ts`: every upstream case is there as a passing test, a skipped test for a rule sparkdown lacks, or an entry in `LintNotApplicable.test.ts` with the reason, and `LintCoverage.test.ts` checks that none is missing.

## Rules sparkdown has

| Luau lint | What it reports | Where it runs |
| --- | --- | --- |
| `LocalUnused` | A `local` that is never read. Writing to it does not count; a name starting with `_` is exempt. | Locals inside functions |
| `UnreachableCode` | The statement after one that always returns, breaks, continues or errors (`error(...)`, `assert(false)`). | Function bodies |
| `DuplicateCondition` | A condition repeated in one `if`/`elseif` chain, one `if` expression, or one `and`/`or` chain. `a and b or c` is exempt. | Luau `if` statements and expressions and Luau `and`/`or` |
| `ForRange` | A numeric `for` without a step that runs backwards, stops short of a fractional end, or starts or ends at 0 over a table's length (a bare `#t`, as in Luau). | Luau `for` loops |
| `PlaceholderRead` | A read of the placeholder `_`, local or global, including a compound write (`_ += 1`). A plain write is not reported. | Inside functions |
| `TableLiteral` | Duplicate literal string fields or nonnegative signed-32-bit integer indices, including indices occupied by list entries; overlapping table-type property access. | Luau table literals and table types |
| `TableOperations` | Suspicious `table.insert`, `table.remove`, `table.move`, or `table.create` arguments. | Direct calls through the global `table` library |
| `DeprecatedApi` for `getfenv`/`setfenv` | A numeric-literal environment level passed to the global builtin. Information severity, tagged Deprecated. | Direct builtin calls |

The arms of Sparkdown's narrative `if`/`elseif` blocks around dialogue and actions are not compared with each other; their conditions and the Luau inside them are checked like any other. The `if` and `for` control flow of Sparkle `layout` blocks is a separate construct in the grammar and is not checked.

Sparkdown also has warnings that correspond to two more Luau lints, in its own wording:

| Luau lint | Sparkdown |
| --- | --- |
| `UnknownGlobal` | `Cannot find variable named ...`, for a read of a global that no script declares or assigns, at the top level and inside a function. |
| `DeprecatedGlobal`, `DeprecatedApi` | An Information diagnostic tagged Deprecated for Luau's deprecated stdlib entries (`unpack`, `table.getn`, `table.foreach` and others), naming the replacement. |

The warnings sparkdown gives for its own syntax (unknown Sparkle events and props, unknown rich text tags, blank choices) are listed in `LintSparkdownWarnings.test.ts`.

## How the rules differ from Luau's

The rules walk the Luau AST that `src/compiler/typecheck/readLuauAst.ts` reads from the syntax tree the editor highlights, the reading the type checker checks (see `TYPECHECK.md`), so a name is a local where Luau would bind it, as Luau's parser resolves it, and an expression has Luau's shape. Where they differ from Luau's linter:

- Besides the units the type checker reads, the rules read the Luau expressions in Sparkdown's own text and constructs: an interpolation (`{a and b}`) or a call shorthand (`{{f(a or b)}}`) in a line, a line of dialogue, a choice or a line inside a narrative block; a divert's arguments; an alternator's selector (`match (a and b)`, `plural(n)|...`); a Sparkle handler and the statements of its `{ ... }`; and a property's value or a method in a `define`. Each expression that holds an `and`/`or` chain, an `if` expression or a function is read on its own, and each `if` or `for` statement is read as the body of a function.
- `LocalUnused`, `UnreachableCode` and `PlaceholderRead` read every Luau function a script holds, a definition (`function f()`) or a value (`local f = function() end`, an argument, a `define`'s property), and a `define`'s method (`greet() ... end`, whose `function` Sparkdown leaves implicit), wherever it is written, each once. A function with a block missing its `end`, whether being typed or cut short, is not checked: the reading takes a later `end` as that block's, so the function does not hold what the author wrote.
- `LocalUnused` does not check locals outside functions. Top-level code is narrative with embedded logic, and a top-level local can be read from places the rule cannot scope (interpolated text, later narrative). `PlaceholderRead` does not check reads outside functions, for the same reason.
- `LocalUnused` does not report a `const`, which declares a global constant in Sparkdown, not a local; a `store` declares a global too.
- The grammar reads some names as Sparkdown's structural words (`style`, `layout`, `match`) even where the author meant a name (`setStyle(style)`, `if match then`), and the reading has no name there. `LocalUnused` counts such a word, after a local's declaration in its function, as a use of the local it names, so a use is never missed (#984).
- Unlike Luau's parser, the reading does not end a block at a `return`, `break` or `continue`: Sparkdown reads the statements after one as its block's, and `UnreachableCode` reports the first of them.
- `DuplicateCondition` and `ForRange` read every Luau `if` statement and expression, `and`/`or` chain and numeric `for` in a script, in functions or not, Sparkdown's narrative blocks included (`if`, `while`, `for`): a narrative block's condition and the Luau inside it are read, but the conditions of a narrative `if` block's arms are not compared with each other.
- `TableOperations` follows Luau's syntax predicates and parentheses escape hatches. Its multi-result `table.insert(t, f())` branch is adapted to the proven direct `string.find` builtin, whose runtime returns the start and end positions (plus captures) on a match. It does not infer return packs for user-defined or unknown functions. Locally shadowed `table` and `string` names are not builtin calls. An explicit global `string` or `string.find` assignment (including a constant string index or function declaration) anywhere in the included scripts conservatively suppresses this multi-result assumption. Cached per-script override facts are recombined for each compile, so adding, editing or removing another script changes only the affected candidate warnings. This approximation does not track aliases, execution order or conditional writes. `TableOperationsIndexer` remains excluded because it needs inferred table types.
- `getfenv`/`setfenv` deprecation follows Luau's numeric-first-argument restriction using an AST numeric literal. Inferred numeric arguments and casts are omitted from this AST-only adaptation. The diagnostics retain Sparkdown's existing Information severity and Deprecated tag for deprecations.
- `TableLiteral` checks the existing AST, including Luau's access-aware table types: separate `read` and `write` fields are allowed, overlapping access is reported. Literal keys wrapped in parentheses, fractional and negative keys, and integer keys above 2147483647 stay outside Luau's literal-key predicates.
- The pinned `read_write_table_props` case is active coverage for `TableLiteral`. Its duplicate-access checks need only the AST's property-access bits; its earlier classification as requiring the type checker was incorrect.

The pass runs over whole scripts on every compile rather than inside the incremental annotators, since a lint depends on lines far from the one it reports, and the compiler caches each script's result until its syntax tree changes.

## Checking for false positives

Every change to a lint runs the corpus script and reads what it reports:

```bash
node packages/sparkdown/scripts/lintCorpus.mjs --project <path-to-R&B>/project > findings.txt
```

It compiles every tracked `.sd` file in the repository, Luau's vendored conformance files (each wrapped in a function, with line numbers still those of the `.luau` file) and, when `--project` is given, a project such as R&B as one program. It prints each lint as `file:line:column Code message`, in a stable order, and a count per corpus on stderr. Every finding it prints is read in context, and the output is diffed against a run on the base commit to see exactly what a change added or removed.

## Rules sparkdown lacks

Each has its upstream cases ported as skipped tests, ready to be enabled by an implementation.

| Luau lint | Test file |
| --- | --- |
| `BuiltinGlobalWrite`, `GlobalAsLocal`, `LocalShadow`, `FunctionUnused`, `UninitializedLocal`, `DuplicateFunction`, `DuplicateLocal` | `LintCandidatesScope.test.ts` |
| `MultiLineStatement`, `UnbalancedAssignment`, `ImplicitReturn`, `MisleadingAndOr`, `ComparisonPrecedence`, `IntegerParsing` | `LintCandidatesStyle.test.ts` |
| `FormatString` | `LintCandidatesStdlib.test.ts` |

## Rules sparkdown omits

These depend on Luau features sparkdown does not have, and are listed with their reasons in `LintNotApplicable.test.ts`:

- `--!` directive comments: `--!nolint`, `--!optimize`, and the `WrongComment` lint that checks them. A `.luau` file's `--!strict`, `--!nonstrict` and `--!nocheck` set its type checking mode, and the type checker reports the half of that lint that concerns them (`CommentDirective`, see `TYPECHECK.md`).
- `@deprecated` and `@native` function attributes, and `RedundantNativeAttribute`.
- Lints that need the type checker (#589): `UnknownType`, the typed half of `DeprecatedApi`, `TableOperations` on indexers, typed `FormatString`.
- `ImportUnused`, which is about `require`; sparkdown has no modules.

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

Sparkdown's narrative `if`/`elseif` blocks around dialogue and actions, and loops in Sparkle `layout` blocks, are separate constructs in the grammar and are not checked.

Sparkdown also has warnings that correspond to two more Luau lints, in its own wording:

| Luau lint | Sparkdown |
| --- | --- |
| `UnknownGlobal` | `Cannot find variable named ...`, for a read at the top level. Inside a function an unknown global is not reported. |
| `DeprecatedGlobal`, `DeprecatedApi` | An Information diagnostic tagged Deprecated for Luau's deprecated stdlib entries (`unpack`, `table.getn`, `table.foreach` and others), naming the replacement. |

The warnings sparkdown gives for its own syntax (unknown Sparkle events and props, unknown rich text tags, blank choices) are listed in `LintSparkdownWarnings.test.ts`.

## How the rules differ from Luau's

The rules read the syntax tree the editor highlights with, which is not a Luau AST, and every rule is written to stay silent where the tree does not have the shape it expects. So each rule misses some cases Luau's linter catches, and should never report one that Luau's would not.

- A function missing its `end`, whether being typed or cut short by a parse error, is not checked by `LocalUnused` or `UnreachableCode`: the tree ends it early, and the lines after the break are parsed as top-level code.
- `LocalUnused` does not check locals outside functions. Top-level code is narrative with embedded logic, and a top-level local can be read from places the rule cannot scope.
- `LocalUnused` counts a read in the declaration's own initializer as a read of the new local, so `local x = x + 1` with the new `x` never read is not reported. On one line the grammar can nest the statements that follow a declaration inside it, and starting the scope early keeps reads there from being missed.
- `LocalUnused` does not report a name declared twice in one statement (`local a, a = ...`).
- `DuplicateCondition` does not compare an `if` expression used as an `if` statement's condition: the grammar reads the expression as running on through the statement's `then` and `elseif`s.
- `UnreachableCode` reports an expression on the line after a bare `return`. In Luau that expression is the returned value; sparkdown ends the `return` at its line, so the expression never runs.

Because the pass runs over whole scripts on every compile (a lint depends on lines far from the one it reports), it finds the constructs it checks from their keywords in the text rather than by walking the tree, and caches each script's result until the script changes. It takes about 3 ms on a 210 KB narrative script and 30 to 45 ms on 40 KB of dense Luau in a single function.

## Rules sparkdown lacks

Each has its upstream cases ported as skipped tests, ready to be enabled by an implementation.

| Luau lint | Test file |
| --- | --- |
| `PlaceholderRead`, `BuiltinGlobalWrite`, `GlobalAsLocal`, `LocalShadow`, `FunctionUnused`, `UninitializedLocal`, `DuplicateFunction`, `DuplicateLocal` | `LintCandidatesScope.test.ts` |
| `MultiLineStatement`, `UnbalancedAssignment`, `ImplicitReturn`, `MisleadingAndOr`, `ComparisonPrecedence`, `IntegerParsing` | `LintCandidatesStyle.test.ts` |
| `FormatString`, `TableLiteral`, `TableOperations`, `DeprecatedApi` for `getfenv`/`setfenv` | `LintCandidatesStdlib.test.ts` |

## Rules sparkdown omits

These depend on Luau features sparkdown does not have, and are listed with their reasons in `LintNotApplicable.test.ts`:

- `--!` directive comments: `--!nolint`, `--!strict`, `--!optimize`, and the `WrongComment` lint that checks them.
- `@deprecated` and `@native` function attributes, and `RedundantNativeAttribute`.
- Lints that need the type checker (#589): `UnknownType`, the typed half of `DeprecatedApi`, `TableOperations` on indexers, typed `FormatString`, read/write table type properties.
- `ImportUnused`, which is about `require`; sparkdown has no modules.

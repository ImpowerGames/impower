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

Sparkdown's narrative `if`/`elseif` blocks around dialogue and actions, and loops in Sparkle `layout` blocks, are separate constructs in the grammar and are not checked.

Sparkdown also has warnings that correspond to two more Luau lints, in its own wording:

| Luau lint | Sparkdown |
| --- | --- |
| `UnknownGlobal` | `Cannot find variable named ...`, for a read of a global that no script declares or assigns, at the top level and inside a function. |
| `DeprecatedGlobal`, `DeprecatedApi` | An Information diagnostic tagged Deprecated for Luau's deprecated stdlib entries (`unpack`, `table.getn`, `table.foreach` and others), naming the replacement. |

The warnings sparkdown gives for its own syntax (unknown Sparkle events and props, unknown rich text tags, blank choices) are listed in `LintSparkdownWarnings.test.ts`.

## How the rules differ from Luau's

The rules read the syntax tree the editor highlights with, which is not a Luau AST, and every rule is written to stay silent where the tree does not have the shape it expects. So each rule misses some cases Luau's linter catches, and should never report one that Luau's would not.

- A function missing its `end`, whether being typed or cut short by a parse error, is not checked by `LocalUnused`, `UnreachableCode` or `PlaceholderRead`: the tree ends it early, and the lines after the break are parsed as top-level code.
- `LocalUnused` does not check locals outside functions. Top-level code is narrative with embedded logic, and a top-level local can be read from places the rule cannot scope.
- `LocalUnused` counts a read in the declaration's own initializer as a read of the new local, so `local x = x + 1` with the new `x` never read is not reported. On one line the grammar can nest the statements that follow a declaration inside it, and starting the scope early keeps reads there from being missed.
- `LocalUnused` does not report a name declared twice in one statement (`local a, a = ...`).
- `ForRange` does not report a bound such as `#t ^ 2`. Luau reads it as `#(t ^ 2)`, a bare length, because `^` binds tighter than `#`, but the grammar places `^ 2` after the operand like any other arithmetic, and the rule treats arithmetic after `#t` as making the bound something other than a length.
- `DuplicateCondition` does not compare an `if` expression used as an `if` statement's condition: the grammar reads the expression as running on through the statement's `then` and `elseif`s.
- `PlaceholderRead` does not check reads outside functions (narrative logic lines, interpolations, Sparkle handlers), for the same reason `LocalUnused` does not check top-level locals.

Because the pass runs over whole scripts on every compile (a lint depends on lines far from the one it reports), it finds the constructs it checks from their keywords in the text rather than by walking the tree, and caches each script's result until the script changes. It takes about 3 ms on a 210 KB narrative script and 25 to 60 ms on 40 KB of dense Luau in a single function, where every name is resolved.

## Names and scopes

The rules about names read one model of them, in `src/compiler/lint/luauNames.ts`, rather than the tree.

For each outermost function, the model lists every declaration (locals, parameters including a method's implicit `self`, loop variables and local functions, with the range each is visible in) and every occurrence of a name, marked as a read, a plain write (`x = ...`), a compound write (`x += ...`) or the name of a `function x()` statement that assigns a local. Each occurrence lists the declarations it can refer to: none for a global, one where the tree is certain, and two inside a `local` statement after its names, where the tree cannot tell the initializer (`local x = x + 1`, the outer `x`) from a statement the grammar nested there on one line (the new `x`). A `local` the grammar nested inside another statement (`local a = {} local b = a`, or `& local x = 5` in a function) is visible to the end of the nearest enclosing block. Since where its statement ends is uncertain, it hides no outer local of the same name, and `LocalUnused` does not report it. Inside a function, any occurrence the tree does not mark as a field, method, string or comment counts, so a use is never missed. A keyword token or a name in a type counts when it names a local: the grammar marks Sparkdown's structural words (`style`, `layout`, `match`) as keywords even where the author meant a name (`print(style)`), and a local named in a type annotation is used, as in Luau. A keyword or a name in a type that names no local is never a use: the compiler reads no variable for a structural word, so a global named `style`, `match` or `continue` has no uses in the model, and neither do `continue`, `type X = ...` and `store x = 1` as statements. A function missing its `end` has declarations up to the break and no occurrences.

Across the program, `indexProgramNames` lists every global by name: its definitions (global functions, `store` and `const` declarations) and every use from any script, whether in a function, a narrative logic line (`& f()`), an interpolation (`{hp}`) or a Sparkle handler (`@click=f`). Outside functions only Luau variable, function and handler names count, since most of that text is prose; a structural word there (`{match}`, `{queue | A | B end}`, `& layout("x")`) is the keyword of its construct, and the compiler reads no variable for it. A top-level `local` of the same name is not told apart from the global. A global's uses outside functions are looked for only when asked for, one name at a time. The compiler keeps each script's facts with its lints until the script changes; a rule that looks at the whole program passes the cached facts of every script to `indexProgramNames`.

`LocalUnused` reads the model, so four shapes are reported that a pass counting every occurrence of the name would miss, as Luau's linter reports them:
- a `store` or `const` inside a function defines the global, so its name there is not a read of a local of the same name;
- inside a method (`function t:m()`), `self` is the method's own parameter, not a local of that name outside it;
- a write from a narrative logic line in a function (`& hp = 5`) is a write, not a read;
- a nested redeclaration's name (`local a = {} local x = 3`) is a declaration, not a read of the outer `x`.

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
| `FormatString`, `TableLiteral`, `TableOperations`, `DeprecatedApi` for `getfenv`/`setfenv` | `LintCandidatesStdlib.test.ts` |

## Rules sparkdown omits

These depend on Luau features sparkdown does not have, and are listed with their reasons in `LintNotApplicable.test.ts`:

- `--!` directive comments: `--!nolint`, `--!optimize`, and the `WrongComment` lint that checks them. A `.luau` file's `--!strict`, `--!nonstrict` and `--!nocheck` set its type checking mode, and the type checker reports the half of that lint that concerns them (`CommentDirective`, see `TYPECHECK.md`).
- `@deprecated` and `@native` function attributes, and `RedundantNativeAttribute`.
- Lints that need the type checker (#589): `UnknownType`, the typed half of `DeprecatedApi`, `TableOperations` on indexers, typed `FormatString`, read/write table type properties.
- `ImportUnused`, which is about `require`; sparkdown has no modules.

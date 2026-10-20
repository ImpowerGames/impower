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
| `LocalShadow` | A used local, parameter or loop variable that hides an earlier one of the same function (`Variable 'x' shadows previous declaration at line 2`), or, hiding none, a global the program uses (`Variable 'x' shadows a global variable used at line 3`). A plain write does not use a local. A built-in global, a name starting with `_`, and a local of an enclosing function are exempt. | Locals inside functions; the global form over the whole program |
| `FunctionUnused` | A `local function` that is never read, or a global `function f()` whose name nothing in the program mentions except other `function f()` statements (`Function 'f' is never used; prefix with '_' to silence`). A call inside its own body reads a local function; any other occurrence of a global's name, a write included, uses it. A name starting with `_` is exempt; methods and members (`function T:m()`, `function T.f()`) are not reported. | Local functions inside functions; global functions over the whole program |
| `SameLineStatement` | A second statement on the same line without a semicolon after the previous statement, once per line. A local followed by a `do` block is exempt. | Luau statement blocks |
| `MultiLineStatement` | A continuation expression that begins no farther right than its statement, once per statement. Table contents and `repeat` conditions are exempt. | Luau statement blocks |

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
- `LocalUnused` does not report a `const` outside every function, which is the story's published constant, a global; a `store` declares a global too. A `const` inside a function, a Sparkle handler included, is Luau's local, and an unused one is reported as a local is.
- The grammar reads some names as Sparkdown's structural words (`style`, `layout`, `match`) even where the author meant a name (`setStyle(style)`, `if match then`), and the reading has no name there. `LocalUnused` counts such a word, after a local's declaration in its function, as a use of the local it names, so a use is never missed (#984).
- `LocalShadow` exempts names starting with `_`, which Luau exempts only from its unused-local warnings. Its global form looks at the whole program: a global read or written in another script, a narrative line, an interpolation or a Sparkle handler counts as used. The message names the first use in the local's own script, as Luau's does; with none there, it names the first by script URI and then position in another script, and adds that script's path, relative to the main script's folder as an `include` line names it: `Variable 'x' shadows a global variable used at line 3 in 'chapter.sd'`. Built-ins are the standard library's names and the globals and type names of the builtins prelude. The global form reruns over the cached facts on every compile, so a script's warning comes and goes as other scripts change or leave the program. It is silent for a name declared as a `local` or `local function` in a unit's outermost block in any script (such a local can reach later scenes and including scripts, which the reading does not show) or that the grammar reads as a keyword somewhere in the program. It does not count a reference on a line with a syntax error (an integer literal's `i` suffix reads as a name), nor, in an expression read outside every unit (an interpolation, a Sparkle handler, which are read without the locals around them), a reference that a local of its name declared outside that expression in the same script could reach, or that names a parameter of the scene or branch it is in, up to that flow's `end`. A reference in a unit's or a handler's own Luau is bound as Luau binds it, so `local x = x` reads the global. A story constant (a `const` outside every function) is a global, so a local named like one is reported against the constant's uses. A keyword reading of the name inside the function silences the local form. As in Luau, a parameter or loop variable hiding another is not reported unless the hidden one is a loop variable never used, and a local declared by the same statement as the one it hides, or a local function hiding a local function, is left to `DuplicateLocal` and `DuplicateFunction`.
- `FunctionUnused`'s local form checks local functions inside functions only, as `LocalUnused` checks locals, and not in a function holding a syntax error: recovery can end the function early (at a Luau `class`, which the grammar lacks) and read the calls after it as narrative. A keyword reading of the name inside the function counts as a use, as for `LocalUnused`. Its global form looks at the whole program: a read or write in another script, a narrative `&` line, an interpolation, a divert's arguments or a Sparkle handler uses the function. It reruns over the cached facts on every compile, so a script's warning comes and goes as other scripts change or leave the program. Because the warning concludes from an absence, it is also silent for a name the grammar reads as a keyword somewhere in the program, for one that a script spells where the reading placed no name in Luau or Sparkle syntax (a bare `@click=f` handler, a `define`'s value), a divert's path or a Luau string, for a name defined anywhere inside a statement holding a syntax error or a block missing its `end` (such a statement can run on past the calls after it), and for the builtins prelude's globals and type names. A mention in dialogue, a choice's text or a comment is not a use. As in Luau, the name warns once per script, at its last definition there; a `store function` is a function statement on a global too.
- Unlike Luau's parser, the reading does not end a block at a `return`, `break` or `continue`: Sparkdown reads the statements after one as its block's, and `UnreachableCode` reports the first of them.
- `DuplicateCondition` and `ForRange` read every Luau `if` statement and expression, `and`/`or` chain and numeric `for` in a script, in functions or not, Sparkdown's narrative blocks included (`if`, `while`, `for`): a narrative block's condition and the Luau inside it are read, but the conditions of a narrative `if` block's arms are not compared with each other.
- `SameLineStatement` and `MultiLineStatement` use the statements and expression boundaries of the existing AST, including functions in interpolations and properties. `SameLineStatement` also checks narrative `&` logic lines, which are bounded to one line; multiline continuations belong in supported multiline Luau contexts, such as actual function bodies (see [why the grammar has paired rules](GRAMMAR.md#131-why-pairs-exist)). Narrative text is excluded. Syntax errors and incomplete blocks are left alone because recovery can change those boundaries. The two diagnostic names are distinct, as in Luau.

The pass runs over whole scripts rather than inside the incremental annotators, since a lint depends on lines far from the one it reports. The compiler caches each script's diagnostics and name facts until its syntax tree changes. Structural extraction uses Lezer's public `Tree`/`TreeBuffer` representation to select Luau nodes without building a cursor for every narrative word and grammar capture; embedded expression ASTs and narrative-if offsets are read once per tree. The rules themselves still execute on each direct call to `collectLuauLints`.

## Shared name facts and program index

`src/compiler/lint/luauNames.ts` collects names from the converter AST that the type checker reads, with the same `AstLocal` objects for declarations and references. `LuauScriptLints.names` distinguishes local declarations and parameters, global definitions, reads, plain writes and compound writes. It retains each reference's authored enclosing function and each declaration's AST block identity. A `store` or a `const` outside every function remains an explicit global definition; a `const` in a function is a local declaration, as Luau's is (`LocalUnused` reports it unused as it reports a `local`); a property write reads its receiver and index rather than writing the receiver's name.

An embedded `store` keeps the same explicit global status as a normalized document-unit store, including its function value when present. A published `const`'s checking binding does not introduce a runtime local: references follow its existing `AstLocal.shadow` chain to a real local when one remains in scope, while retaining the original expression node. Otherwise the reference is global. This applies to plain and compound targets and member receivers as well as reads.

Authored function statements also retain their qualified paths and receivers, the local binding identity where applicable, and whether they are methods. Separate `if` arms keep distinct AST block identities. Synthetic wrappers used to read scene/branch units or Sparkle handler statements are not authored declarations, functions or enclosing functions; their authored parameters and nested functions retain their original identities. A flow wrapper's exact synthetic binding is classified as a runtime global when an authored name collides with it, because that checking-only local is absent at runtime; real authored locals of the same spelling remain local.

Declaration `scope` is the owning AST block: parameters and loop variables use their function or loop body, and ordinary locals use the block containing their declaration. Binding identity remains the converter's authority for visibility, including a `repeat` body's locals in its `until` condition. Parser recovery identifiers such as `%error-id%` are excluded from name facts and unused-local warnings.

The facts include all document units and embedded Luau access paths and expressions in narrative text, interpolations, call shorthand, define values and Sparkle handlers. Standalone embedded expressions use the converter's existing reading, which classifies their names as globals; this pass does not add a second parser or scope resolver.

The grammar can mark a valid use of `style`, `layout` or `match` as a structural keyword, leaving no corresponding name expression in the converter AST. `LuauNameFacts.uncertainNames` records these unrepresented keyword occurrences with their exact name, range and `grammar-keyword` reason. It excludes represented declarations, definitions and references and Luau reserved words; soft keywords are not blindly treated as reserved. These occurrences have no AST node, binding or access classification. They are cached by tree and recombined into the separate `LuauProgramNames.uncertainNames` map with script URIs; they never create definite global entries or reads. Each declaration also records `scopeTo`, the document offset where its block ends.

Rules drawing conclusions from absent uses, enclosing-function exclusivity or initialization must consult same-name uncertainty and suppress unsafe warnings. An uncertain occurrence alone must not activate `LocalShadow` or invent a global use. File/program-wide conservatism may suppress a warning that fuller AST coverage would permit; avoiding false warnings takes precedence. The existing `LocalUnused` keyword workaround remains in place, so this contract adds neither warning rules nor a separate parser or lexical resolver.

`LuauScriptLints.roots` exposes those same cached AST roots and their `offsets.range(location)` mapping for expression-based rules. Handler statement roots omit their synthetic function wrapper. Flow roots preserve the complete converter root and identify their exact checking wrapper with `syntheticFunction`; name facts use this provenance rather than filtering any authored name. Consumers can visit these roots without discovering or parsing embedded candidates again.

`SparkdownCompiler.validateLints` combines the current scripts with `indexProgramNames` on every validation. The returned index holds definitions, reads and writes by global name, with script URIs, plus authored function definitions and the per-script facts. Recombining the current script set removes deleted scripts and uses immediately, while unchanged trees retain their fact and local identities. These are shared prerequisites for name-based warning rules; this index introduces no new warning rule by itself.

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
| `BuiltinGlobalWrite`, `GlobalAsLocal`, `UninitializedLocal`, `DuplicateFunction`, `DuplicateLocal` | `LintCandidatesScope.test.ts` |
| `UnbalancedAssignment`, `ImplicitReturn`, `MisleadingAndOr`, `ComparisonPrecedence`, `IntegerParsing` | `LintCandidatesStyle.test.ts` |
| `FormatString`, `TableLiteral`, `TableOperations`, `DeprecatedApi` for `getfenv`/`setfenv` | `LintCandidatesStdlib.test.ts` |

## Rules sparkdown omits

These depend on Luau features sparkdown does not have, and are listed with their reasons in `LintNotApplicable.test.ts`:

- `--!` directive comments: `--!nolint`, `--!optimize`, and the `WrongComment` lint that checks them. A `.luau` file's `--!strict`, `--!nonstrict` and `--!nocheck` set its type checking mode, and the type checker reports the half of that lint that concerns them (`CommentDirective`, see `TYPECHECK.md`).
- `@deprecated` and `@native` function attributes, and `RedundantNativeAttribute`.
- Lints that need the type checker (#589): `UnknownType`, the typed half of `DeprecatedApi`, `TableOperations` on indexers, typed `FormatString`, read/write table type properties.
- `ImportUnused`, which is about `require`; sparkdown has no modules.

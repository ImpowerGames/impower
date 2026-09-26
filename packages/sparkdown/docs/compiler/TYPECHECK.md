# Type checking

Sparkdown type checks Luau code with a port of Luau's own type checker, the "new solver", in `src/compiler/typecheck/`. The port follows Luau at commit `7d5f73364fdbbaa984fa545071630eba73cfea98` (the commit `src/tests/luau-conformance/upstream/typecheck-cases.json` pins), configured as Luau's CI runs the new solver: every flag whose name does not start with `Debug` or `Test` is on. Each file is named after the Luau file it ports (`ConstraintSolver.cpp` is `ConstraintSolver.ts`) and says so in its header; `LICENSE-luau.txt` in that directory holds Luau's license. Its types print exactly as Luau's `toString` prints them, and its warnings carry Luau's messages, so Luau's own tests are its specification (see `src/tests/luau-conformance/typecheck/README.md`).

## What is checked

The checker reads the Luau that Sparkdown's syntax tree marks as Luau, and parses that text with the port of Luau's parser (`DefinitionParser.ts`), because the tree keeps operators as flat chains and types without precedence while the checker needs Luau's own tree, locations and name resolution.

- A `.luau` file loaded with `run` is one module.
- A `.sd` file is checked in units: its prelude (the Luau statements outside any scene or branch, and every `function` definition) and one unit per scene or branch that holds Luau statements. A flow is checked as the body of a function whose parameters are the flow's, with the prelude's names and type aliases in scope at the types the prelude's check gave them.

Narrative, and the parts of a Luau line that are Sparkdown's own, are left out: the `&` that marks a statement, `store`, and the `choose`, `then` and `end` of a `choose` block, whose statements run in its flow's scope. Sparkdown's own expressions (alternators such as `plural(n)|one="is"|other="are"`, divert targets such as `-> place`, and regular expressions such as `@/a+/`) are checked as `_G()`, a call of Luau's `_G`, which is typed `any`, so the statement that holds one is checked as written around it. A backtick string's `{{f}}` is left out.

Every unit sees Luau's builtin globals (Luau's builtin definitions, loaded as Luau loads them) and, typed `any`, every name the program declares in Sparkdown (scenes, branches, defines, stores, functions in other files) and the namespaces Sparkdown's runtime adds to Luau's standard library, such as `count`. Each of those names is a type as well, since a define declares one, so `c: companion` needs no Luau declaration of `companion`.

`LuauDocumentChecker.ts` turns a document into units and checks one; `SparkdownTypechecker.ts` holds the environment and the cache; `SparkdownCompiler.validateTypes` runs them after the program's context is built.

## Modes

As in Luau, a module is checked in one of three modes: `nonstrict` (the default), which reports what is certainly wrong; `strict`, which also infers the types of unannotated code and reports every mismatch; and `nocheck`, which reports nothing.

- The project's mode is `config.typecheck.mode`. `builtins.sd` defines it as `"nonstrict"`; a project changes it with `define typecheck as config with mode = "strict" end`.
- A `.sd` file's `typecheck:` front matter field sets that file's mode. It is not shown on the screenplay's title page.
- A `.luau` file's `--!strict`, `--!nonstrict` or `--!nocheck` first line sets that file's mode, as it does in Luau.

The more specific setting wins. A mode Sparkdown does not know is warned about where it is written, and the next setting applies.

## Diagnostics

Every type diagnostic is a warning whose `code` is the Luau error kind (`TypeMismatch`, `UnknownSymbol`, ...), with Luau's message as plain text (a printed type such as `<T>(T) -> T` is not markdown) and its exact range. Syntax is the grammar's to report, so the checker's own parse errors are not shown. A name Sparkdown's own resolver reports as unknown (``Cannot find variable named `x` ``) is not reported again; inside a function, where the resolver reports nothing, the checker's `Unknown global` is the report. Checking never changes the compiled program.

## Incremental checking

Each unit's result is cached under its document, its text, its mode and the names and types it can see: a unit's text holds whole source lines, with the document line of each kept beside it, so the result stays valid when lines move around the unit. An edit checks again only the units whose text changes, unless it changes a prelude name's type (a signature) or a prelude type alias, which checks every flow of that file again, or changes the names the program declares, which checks every unit again. A result depends on nothing else, so a check that reuses results gives exactly what a check from scratch gives (`src/tests/compiler/typecheckIncremental.test.ts`).

## Limits

- A name another file declares is `any`, whatever its declaration says.
- Sparkdown's own constructs (defines, scenes as values, diverts) are not typed; annotations inside definitions are not read.
- The Luau inside Sparkdown's own constructs (an alternator's arms, a divert's arguments, the statements of an alternator block) is not checked.
- A malformed type annotation is not reported (see `docs/runtime/DIVERGENCES.md`).

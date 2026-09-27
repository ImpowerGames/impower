# Type checking

Sparkdown type checks Luau code with a port of Luau's own type checker, the "new solver", in `src/compiler/typecheck/`. The port follows Luau at commit `7d5f73364fdbbaa984fa545071630eba73cfea98` (the commit `src/tests/luau-conformance/upstream/typecheck-cases.json` pins), configured as Luau's CI runs the new solver: every flag whose name does not start with `Debug` or `Test` is on. Each file is named after the Luau file it ports (`ConstraintSolver.cpp` is `ConstraintSolver.ts`) and says so in its header; `LICENSE-luau.txt` in that directory holds Luau's license. Its types print exactly as Luau's `toString` prints them, and its warnings carry Luau's messages, so Luau's own tests are its specification (see `src/tests/luau-conformance/typecheck/README.md`).

## What is checked

The checker reads the Luau that Sparkdown's syntax tree marks as Luau, and parses that text with the port of Luau's parser (`DefinitionParser.ts`), because the tree keeps operators as flat chains and types without precedence while the checker needs Luau's own tree, locations and name resolution.

- A `.luau` file loaded with `run` is one module.
- A `.sd` file is checked in units: its prelude (the Luau statements outside any scene or branch, and every `function` definition, which Sparkdown lowers to a file-level function wherever it is written) and one unit per scene, or branch outside any scene, that holds Luau statements. A flow is checked as the body of a function whose parameters are the flow's, with the prelude's names and type aliases in scope at the types the prelude's check gave them.
- A branch inside a scene runs in its scene's call-stack element, where the scene's locals and those its other branches set are visible, so it is checked as part of its scene's unit, in document order, with its named parameters declared as a `local` on its header line. At runtime `...` reads the arguments of whichever of the scene and its branches took a `...` last, so the unit's function takes `...` when the scene or any branch in it does, with the type they all give theirs, or no type where they differ.

Narrative, and the parts of a Luau line that are Sparkdown's own, are left out: the `&` that marks a statement, `store`, and the `choose`, `then` and `end` of a `choose` block, whose statements run in its flow's scope. Sparkdown's own expressions (alternators such as `plural(n)|one="is"|other="are"`, divert targets such as `-> place`, and regular expressions such as `@/a+/`) are checked as `_G()`, a call of Luau's `_G`, which is typed `any`, so the statement that holds one is checked as written around it. A backtick string's `{{f}}` is left out. A line left blank is left out of the unit, except inside a string or comment that spans lines, whose lines are kept as written since they are the string's value.

Every unit sees Luau's builtin globals (Luau's builtin definitions, loaded as Luau loads them) and, typed `any`, every name the program declares in Sparkdown (scenes, branches, defines, stores, functions in other files) and the namespaces Sparkdown's runtime adds to Luau's standard library, such as `count`. Each of those names is a type as well, since a define declares one, so `c: companion` needs no Luau declaration of `companion`.

`LuauDocumentChecker.ts` turns a document into units and checks one; `SparkdownTypechecker.ts` holds the environment and the cache; `SparkdownCompiler.validateTypes` runs them after the program's context is built.

## Modes

As in Luau, a module is checked in one of three modes: `nonstrict` (the default), which reports what is certainly wrong; `strict`, which also infers the types of unannotated code and reports every mismatch; and `nocheck`, which reports nothing.

- The project's mode is `config.typecheck.mode`. `builtins.sd` defines it as `"nonstrict"`; a project changes it with `define typecheck as config with mode = "strict" end`.
- A `.sd` file's `typecheck:` front matter field sets that file's mode. It is not shown on the screenplay's title page.
- A `.luau` file's `--!strict`, `--!nonstrict` or `--!nocheck` first line sets that file's mode, as it does in Luau. Neither the web editor nor the VS Code extension registers `.luau` files as scripts by default (both use `*.{sd}`), so this applies where a host registers them.

The more specific setting wins. A mode Sparkdown does not know in the config or the front matter is warned about where it is written (`UnknownTypecheckMode`), and the next setting applies. In a `.luau` file, a `--!` directive Luau does not know, a mode directive with more on its line or given twice, and a directive after the first token are warned about as Luau's linter warns about them (`CommentDirective`, from the part of Luau's `lintComments` that `Linter.ts` ports), and Luau's rule applies: only an exact mode directive before the first token sets the mode. A `--!nolint` does not silence these warnings, since Sparkdown has no lint suppression (see `LINTS.md`).

## Diagnostics

Every type diagnostic is a warning whose `code` is the Luau error kind (`TypeMismatch`, `UnknownSymbol`, ...), with Luau's message as plain text (a printed type such as `<T>(T) -> T` is not markdown) and its exact range. Luau counts a column in UTF-8 bytes; each column is turned into the document's UTF-16 column on its line. Syntax is the grammar's to report, so the checker's own parse errors are not shown. The checker leaves out its `Unknown global` warning where Sparkdown's own resolver reports the name (``Cannot find variable named `x` ``) at a range that holds the read, so a read is reported once. The resolver does not yet report a read it can place only on the scene or branch around it, such as one in an `if` or a `local` in a scene (#944), and there the checker's warning is the report; a top-level `local` whose initializer reads an unknown name is reported by both, the resolver's warning at the start of the document, until the resolver places it (#944). Checking never changes the compiled program.

## Incremental checking

Each unit's result is cached under its document, its text, its mode and the names and types it can see: a unit's text holds whole source lines, with the document line of each kept beside it, so the result stays valid when lines move around the unit. An edit checks again only the units whose text changes, unless it changes a prelude name's type (a signature) or a prelude type alias (its parameters' defaults included), which checks every flow of that file again, or changes the names the program declares, which checks every unit again. A result depends on nothing else, so a check that reuses results gives exactly what a check from scratch gives (`src/tests/compiler/typecheckIncremental.test.ts`).

## Limits

- A name another file declares is `any`, whatever its declaration says.
- Sparkdown's own constructs (defines, scenes as values, diverts) are not typed; annotations inside definitions are not read.
- The Luau inside Sparkdown's own constructs (an alternator's subject and arms, such as a `match`'s, a divert's arguments, the statements of an alternator block) is not checked.
- A malformed type annotation is not reported (see `docs/runtime/DIVERGENCES.md`).

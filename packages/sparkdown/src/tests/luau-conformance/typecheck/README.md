# Luau's type-checker tests

This directory ports Luau's own type-checker tests, from `tests/` in [luau-lang/luau](https://github.com/luau-lang/luau), as the specification for Sparkdown's type checker (#589). Each port file is named after its upstream file (`TypeInfer.primitives.test.cpp` becomes `TypeInfer.primitives.test.ts`) and hands its cases to `portUpstreamFile` in `portedCases.ts`, which registers one test per case and a coverage test for the file. `../typecheckTestHarness.ts` compiles each snippet.

## What runs

Every case checks that Sparkdown reads its snippets as Luau: the parse check. A case's type assertions run only when its upstream file is switched on, in `CHECKED_AREAS` in `portedCases.ts`; each checker slice switches on the files it implements. A case whose file is off reports as skipped once its parse check passes. Setting `LUAU_TYPECHECK_AREAS` to `all`, or to a comma-separated list of upstream files, switches files on for one run. The checker is the port of Luau's type checker in `src/compiler/typecheck/`; `checkLuau` checks a snippet with the globals of the case's fixture (`Fixture`, `BuiltinsFixture`, its new-solver-only child `TypeStateFixture`, `NegationFixture`, `IsSubtypeFixture`, `ExternTypeFixture`, or `RefinementExternTypeFixture`). From the repository root:

```bash
LUAU_TYPECHECK_AREAS=all node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/typecheck/TypeInfer.primitives.test.ts --wait 900
```

## The upstream cases

`../upstream/typecheck-cases.json` lists every `TEST_CASE` and `TEST_CASE_FIXTURE` in the 31 type-checker files at the pinned commit, in order: each case's name and fixture, whether `DOES_NOT_PASS_NEW_SOLVER_GUARD` covers the whole case or only blocks within it, and whether upstream compiles it at all. It also lists Luau's error kinds. `../upstream/VENDORING.md` says how to regenerate it for another commit. A port file's coverage test fails unless its cases are exactly that file's cases, in upstream order, with the same fixtures and the markers below.

## How a case is ported

- The case's `name` is the upstream name, exactly, and a comment above it gives the upstream file, line and header. A name upstream uses twice is ported twice.
- `fixture` is the upstream fixture, which decides the globals and types in scope; a plain `TEST_CASE` has none, and gives the fixture it builds to each check.
- The Luau source is carried verbatim. A case with one check writes it as `source`; a case that checks several sources, or needs a field on one of them, lists them under `checks`. `module` records the name upstream gives a source it resolves with `require`.
- `mode` is the mode passed to `check(mode, source)`. Without one, a snippet is checked in strict mode, as Luau's test fixture checks it, and a `--!` directive in the snippet overrides that as it does in Luau.
- `flags` preserves each requested `ScopedFastFlag`. When an area executes, flags are validated against the explicitly audited fixed settings below; unknown and opposite values fail rather than silently running a default configuration.
- `limits` records the `ScopedFastInt`s the case sets, each named without its `FInt::` or `DFInt::` prefix and given the value upstream sets for an optimized build without sanitizers. The harness cannot set them, so once the case's area is on it fails as not implemented rather than asserting what upstream sees only under those limits.
- `ignoreMissingAnnotations: true` stands for `ignoreMissingAnnotations(result)`: `TypeAnnotationRequired` errors are dropped before any assertion.
- Where a case branches on `FFlag::DebugLuauForceOldSolver`, only the new-solver branch is ported. A branch on any other flag, or an `#if 0` block, is resolved as Luau's CI runs the new solver, with `--fflags=true`: every flag the case does not set is on, except the `Debug` and `Test` flags, and the `#else` part is the one compiled.
- A source upstream builds in C++ (repeating a fragment up to a recursion limit, or appending generated declarations) is built the same way in TypeScript, with the limit Luau uses in an optimized build without sanitizers.
- Upstream checks about Luau's internals rather than the checked program (which type arena holds a type, internal-error handlers, the print hook) are left out, and a comment on the case names them. Program checks expressible by the expectations below remain executable data even when the harness cannot yet answer their query.

### Expectations

Each check's `expect` lists what upstream asserts about its result, in upstream order:

- `{ errors: n }` for `LUAU_REQUIRE_ERROR_COUNT(n, result)`, and `{ errors: 0 }` for `LUAU_REQUIRE_NO_ERRORS`; `{ errors: "some" }` for `LUAU_REQUIRE_ERRORS`.
- `{ error: i, ... }` for facts about `result.errors[i]`: its `code` (the error kind, from `get<Kind>`), its `message` (the text of `toString(result.errors[i])`, or `{ oneOf: [...] }` when upstream accepts either of several), its `location` (`[beginLine, beginColumn, endLine, endColumn]`, counted from 0 within the snippet as Luau's `Location` is), its `line` (the line it begins on, when that is all upstream checks), and its `fields` (the error struct's fields by their upstream names, with types printed).
- `{ anyError: Kind }` and `{ noError: Kind }` for `LUAU_REQUIRE_ERROR(result, Kind)` and `LUAU_REQUIRE_NO_ERROR(result, Kind)`.
- `{ everyError: { line: n } }` checks every diagnostic's beginning line after any missing-annotation filtering. It makes no assertion about the count; an empty set satisfies it, as upstream's loop does.
- `{ decoratedSource: text }` compares the exact `decorateWithTypes` output, including whitespace and the inferred annotations in the new-solver branch.
- A type assertion names a module-level binding (`type`, as `requireType` finds it), a type alias (`alias`, as `lookupType` finds it) or the type at a position (`typeAt`, as `requireTypeAtPosition` finds it), with an optional `path` into it: a table property's read type, a function's argument or result, an indexer's key or result, or an alias's type parameter. It then states the type's printed text (`equals`, with `options` for Luau's `ToStringOptions`), its Luau class (`kind`, for `get<FunctionType>(...)` and the like), that it is the same type as another selector's (`sameAs`, for comparing `TypeId`s), a function's return pack (`results`), an alias's number of type parameters (`typeParameters`), or a table's number of properties (`properties`). A selector with nothing else states only that the type is there, as upstream's `REQUIRE` on a property, indexer or argument it goes on to read.
- `{ builtin: "number" }` selects the actual builtin TypeId; use `sameAs` for upstream builtin identity comparisons. `global` selects a fixture global. `exportedAlias` and `importedAlias: ["Import", "T"]` select genuine exported/imported bindings. `diagnosticType: [i, "wantedType"]` selects a genuine diagnostic type field; printed `fields` are a separate comparison.
- `{ moduleReturn: true, equals: text }` prints the check's module return pack. Its selector can use a `path` beginning with `{ result: i }` to select a returned value, then traverse that type normally.
- A type selector with `subtypeOf: anotherSelector` and `isSubtype: true` or `false` checks `isSubtype(selected, another)`, preserving the direction and either expected outcome.

Queries execute against the real checker: module return packs, subtyping in either direction, normalization (`normalized: true`), and inferred source decoration. A selector's optional `module` chooses a checked dependency. `expectedTypeAt` reads contextual expected types; `overloadAt` selects a call's resolved overload. Missing graph entries fail explicitly.

Additional type facts include `notEquals` (printed inequality), `notSameAs` (reference inequality), and `printedSameAs` (both sides printed with the same options). Function `arguments`/`returns` accept exact direct head `length` and explicit `tail` presence. `hasSelf`, `generics`, `genericPacks`, generic polarity and `generic`/`genericPack` paths preserve structural predicates. Tables expose `instantiatedTypeParameters`/`instantiatedTypePackParameters` counts and corresponding singular paths, independently of alias declaration parameters. `name`, `hasProperty`, `propertyLocations` and `definitionLocation` query stored metadata. Locations use zero-based four-tuples; a missing property location is `null`. `scopes` can assert `minimum` or exact `count`, alias locations using `scope` or `scopeAt`, and `importedModules` records with scope/name/module.

Diagnostics accept `messageContains`, `messageExcludes`, `endLine`, `moduleMatchesCheck: true`, per-type-field `fieldOptions`, and `fieldLocations` presence/beginning line. `everyError.messageExcludes` preserves a loop's substring predicate. Decoration is derived from checked AST bindings and function types, with original source columns and canonical single-quoted literals; unsupported tokens fail explicitly. It is test-only and does not change author-facing formatting.

### Setup and isolation

Each check creates a fresh frontend, fixture, module graph and arenas. Successful `definitions: string[]` are parsed independently by the verified official parser at the manifest pin, then loaded through the TypeScript frontend's prepared-AST definition API. This parser is a test oracle only; production never imports it. `globals: { foo: "(number) -> string" }` installs independently parsed typed globals without rewriting the snippet. All setup syntax diagnostics retain their own module names and ranges; invalid setup cannot be hidden by an entry snippet's unparsed record.

`moduleSources` maps exact names to exact source strings and supplies dependencies for the check's `module` entry. Every support source receives the compiler parse check, and require paths rooted at `game` or `script.Parent` follow the pinned fixture resolver. Diagnostics include reachable checked dependencies, preserving module names and the pinned frontend's reversed graph traversal/source ordering; unused support sources contribute no checker errors. Changed names evict their module graphs. Cyclic require graphs currently fail explicitly and are separate Task #1384; a missing dependency is handled by the actual checker.

`hiddenTypes: true` installs the pinned hidden aliases, including the builtin `fun` alias, in that check's environment. `retainFullTypeGraphs: false` clones error types into each reachable module's interface arena, discards internal arena ownership and query maps, and retains public return/export/diagnostic queries. Internal graph queries and decoration fail after discard. JavaScript garbage collection cannot reproduce C++ freed-pointer lifetime failures.

An intentional upstream same-fixture sequence uses case `shareFixture: true`, with `clearModules: true` on the transition. It retains the fixture's builtin/global bindings while clearing actual module graphs; unrelated cases and ordinary checks remain fresh. The builtin mutation regression therefore survives the transition instead of being masked by creating another fixture.

### Requested flag settings

The frontend has fixed new-solver semantics rather than mutable FastFlags. Only these proven equivalents are accepted; opposite values are rejected:

| Flag | Value | Evidence in the TypeScript checker |
| --- | --- | --- |
| DebugLuauForceOldSolver | false | Frontend.check invokes the new solver |
| DebugLuauMagicTypes | false | Fixture setup installs no internal magic aliases |
| LuauAvoidTrivialPhis | true | DataFlowGraph.joinScopes skips identical definitions |
| LuauStrictVisitInstantiatedType | true | ConstraintGenerator records failed references; TypeChecker2 visits instantiated arguments and checks failed generic references |
| LuauNewTypePathErrorMessages | true | TypeChecker2.explainReasonings uses metadata-aware traversal/rendering, including the enclosing-negation diagnostic branch |
| LuauFixSuperNegationTypePaths | true | Subtyping's super-negation leaf branches attach the Negated path component, matching the pinned true branches |

`LuauExportValueSyntax=true` has a narrower audited equivalence: the actual AST must contain a const declaration and no exported value/local-function nodes in the entry or supplied dependencies. Pinned Parser.cpp::parseAssignment/parseCompoundAssignment use reportLValueError for const assignment when true; readLuauAst implements that same diagnostic path unconditionally. The const ports execute their exact readonly diagnostics and inferred-type assertions. Value exports and requests without the audited const setup still fail explicitly; their design decision remains pending. This does not claim general export-value syntax support.

Other recorded requests (including annotation warnings, experimental if-local, compound assignment seeding and iterative search), and opposite values for fixed settings, fail with their exact name/value until their behavior or configuration is implemented or separately scoped. Per-area activation Tasks #1360–#1367 retain that work; metadata is not evidence of a tested setting. Numeric limits remain unsupported.

A case upstream asserts nothing about still has a check with an empty `expect`: once its file is switched on, the checker has to run on it.

## Skips and records

A case's `skip` says why its type assertions never run:

- `{ newSolver: NEW_SOLVER_GUARD_REASON }` for a case under `DOES_NOT_PASS_NEW_SOLVER_GUARD`, whose expectations are the old solver's and are not ported. A case that returns before checking on the new solver is skipped with `newSolver` and the upstream reason. When the guard covers only a block within a case, the checks in that block are marked `doesNotPassNewSolver: true` instead, and the rest of the case runs.
- `{ notApplicable: "..." }`, with the specific reason, for a case that cannot apply to Sparkdown.
- `{ disabledUpstream: true }` for a case upstream never compiles, in an `#if 0` region or a comment.

A check within a case that cannot apply to Sparkdown, when the case's other checks can, carries `notApplicable` with the specific reason instead: its snippet still gets the parse check, and only its own assertions never run.

A snippet Sparkdown cannot parse yet carries a record of why: `unparsed: { defect: N }` names the filed Bug, and `unparsed: { divergence: "..." }` names the `packages/sparkdown/docs/runtime/DIVERGENCES.md` section, by its heading, that documents why it never will. The parse check then expects the snippet to fail, so the test fails, and the record has to go, once the snippet parses. A snippet that fails to parse for any other reason is a defect, to be fixed or filed.

A snippet Luau's own parser rejects, such as `return t.` or an `if` expression with no `else`, carries `malformed` with what upstream writes wrong. The parse check then expects Sparkdown to report a syntax diagnostic too, and the case's assertions still run, since Luau's error counts include the parse errors. A malformed snippet Sparkdown reads without complaint has no record, and the error sits in `expect` for the checker to report (see below).

A case with a skip or an unparsed snippet still runs its parse check, then reports as skipped.

## The parse check

Sparkdown's grammar recovers from Luau it cannot read without a diagnostic: it reads the rest of the line as narrative text, or closes the enclosing block early. So the harness reads the syntax tree of the compiled snippet as well as the validator's diagnostics, and reports as a `SyntaxError`, in the snippet's own lines and columns:

- each diagnostic the syntax validator gives the snippet (malformed strings, numbers, escapes and comments, in Luau's wording);
- each node the parser could not finish;
- each node inside the snippet that is not Luau, such as narrative text or a divert, outside the text of strings and comments (the Luau inside a backtick string's braces is read like any other);
- each pair of braces in a string that Sparkdown reads as an expression and Luau does not: interpolation in a double-quoted string, which Luau reads as text, and the `{{name}}` call shorthand, which Luau reads as text in a double-quoted string and rejects in a backtick string; a snippet with one records the divergence by its heading, `` `"..."` interpolates; `'...'` does not ``;
- the function `run` wraps the snippet in closing before the snippet ends.

The parse check asks only whether Sparkdown reads the snippet as Luau. An error Luau's parser reports for a reason the grammar does not look for, such as a `const` assigned a second time, is recorded in `expect` as a `SyntaxError` like any other error, for the checker to report.

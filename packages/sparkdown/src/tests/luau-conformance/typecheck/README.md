# Luau's type-checker tests

This directory ports Luau's own type-checker tests, from `tests/` in [luau-lang/luau](https://github.com/luau-lang/luau), as the specification for Sparkdown's type checker (#589). Each port file is named after its upstream file (`TypeInfer.primitives.test.cpp` becomes `TypeInfer.primitives.test.ts`) and hands its cases to `portUpstreamFile` in `portedCases.ts`, which registers one test per case and a coverage test for the file. `../typecheckTestHarness.ts` compiles each snippet.

## What runs

Every case checks that Sparkdown reads its snippets as Luau: the parse check. A case's type assertions run only when its upstream file is switched on, in `CHECKED_AREAS` in `portedCases.ts`; each checker slice switches on the files it implements. A case whose file is off reports as skipped once its parse check passes. Setting `LUAU_TYPECHECK_AREAS` to `all`, or to a comma-separated list of upstream files, switches files on for one run. Until the checker exists (#599), every type assertion that runs fails with "not implemented", which shows the assertions are wired. From the repository root:

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
- `flags` records the `ScopedFastFlag`s the case sets, other than the solver switch.
- `ignoreMissingAnnotations: true` stands for `ignoreMissingAnnotations(result)`: `TypeAnnotationRequired` errors are dropped before any assertion.
- Where a case branches on `FFlag::DebugLuauForceOldSolver`, only the new-solver branch is ported.
- Upstream checks about Luau's internals rather than the checked program (which type arena holds a type, internal-error handlers, the print hook) are left out, and a comment on the case names them.

### Expectations

Each check's `expect` lists what upstream asserts about its result, in upstream order:

- `{ errors: n }` for `LUAU_REQUIRE_ERROR_COUNT(n, result)`, and `{ errors: 0 }` for `LUAU_REQUIRE_NO_ERRORS`; `{ errors: "some" }` for `LUAU_REQUIRE_ERRORS`.
- `{ error: i, ... }` for facts about `result.errors[i]`: its `code` (the error kind, from `get<Kind>`), its `message` (the text of `toString(result.errors[i])`, or `{ oneOf: [...] }` when upstream accepts either of several), its `location` (`[beginLine, beginColumn, endLine, endColumn]`, counted from 0 within the snippet as Luau's `Location` is), its `line` (the line it begins on, when that is all upstream checks), and its `fields` (the error struct's fields by their upstream names, with types printed).
- `{ anyError: Kind }` and `{ noError: Kind }` for `LUAU_REQUIRE_ERROR(result, Kind)` and `LUAU_REQUIRE_NO_ERROR(result, Kind)`.
- A type assertion names a module-level binding (`type`, as `requireType` finds it), a type alias (`alias`, as `lookupType` finds it) or the type at a position (`typeAt`, as `requireTypeAtPosition` finds it), with an optional `path` into it: a table property's read type, a function's argument or result, an indexer's key or result, or an alias's type parameter. It then states the type's printed text (`equals`, with `options` for Luau's `ToStringOptions`), its Luau class (`kind`, for `get<FunctionType>(...)` and the like), that it is the same type as another selector's (`sameAs`, for comparing `TypeId`s), a function's return pack (`results`), an alias's number of type parameters (`typeParameters`), or a table's number of properties (`properties`).
- A comparison with one of Luau's builtin types (`getBuiltins()->numberType`) is ported as the type printing as that builtin's name, and a comment on the case says so.

A case upstream asserts nothing about still has a check with an empty `expect`: once its file is switched on, the checker has to run on it.

## Skips and records

A case's `skip` says why its type assertions never run:

- `{ newSolver: NEW_SOLVER_GUARD_REASON }` for a case under `DOES_NOT_PASS_NEW_SOLVER_GUARD`, whose expectations are the old solver's and are not ported. A case that returns before checking on the new solver is skipped with `newSolver` and the upstream reason. When the guard covers only a block within a case, the checks in that block are marked `doesNotPassNewSolver: true` instead, and the rest of the case runs.
- `{ notApplicable: "..." }`, with the specific reason, for a case that cannot apply to Sparkdown.
- `{ disabledUpstream: true }` for a case upstream never compiles, in an `#if 0` region or a comment.

A snippet Sparkdown cannot parse yet carries a record of why: `unparsed: { defect: N }` names the filed Bug, and `unparsed: { divergence: "..." }` names the `packages/sparkdown/docs/runtime/DIVERGENCES.md` section, by its heading, that documents why it never will. The parse check then expects the snippet to fail, so the test fails, and the record has to go, once the snippet parses. A snippet that fails to parse for any other reason is a defect, to be fixed or filed.

A case with a skip or an unparsed snippet still runs its parse check, then reports as skipped.

## The parse check

Sparkdown's grammar recovers from Luau it cannot read without a diagnostic: it reads the rest of the line as narrative text, or closes the enclosing block early. So the harness reads the syntax tree of the compiled snippet as well as the validator's diagnostics, and reports as a `SyntaxError`, in the snippet's own lines and columns:

- each diagnostic the syntax validator gives the snippet (malformed strings, numbers, escapes and comments, in Luau's wording);
- each node the parser could not finish;
- each node inside the snippet that is not Luau, such as narrative text or a divert, outside the text of strings and comments (the Luau inside an interpolated string's braces is read like any other);
- the function `run` wraps the snippet in closing before the snippet ends.

The parse check asks only whether Sparkdown reads the snippet as Luau. An error Luau's parser reports for a reason the grammar does not look for, such as a `const` assigned a second time, is recorded in `expect` as a `SyntaxError` like any other error, for the checker to report.

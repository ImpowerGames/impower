# Luau's type-checker tests

This directory ports the pinned Luau tests as the specification for Sparkdown's
type checker (#589). Each port file names its upstream file and calls
`portUpstreamFile` in `portedCases.ts`, registering one test per original case and
a coverage test. `../upstream/typecheck-cases.json` records the original names,
fixtures, order, solver guards and disabled cases; `../upstream/VENDORING.md`
describes the pin and regeneration procedure.

## Execution and proof boundaries

Every source receives Sparkdown's compiler parse check. Active registered cases
then execute the exact source through the test-only official native fixture.
The async registration boundary loads the generated artifact and invokes the
synchronous assertion core with a native checker. Missing artifacts, unsupported
operations and applicable mismatches fail explicitly. Registration has no implicit
TypeScript solver fallback; the older `checkLuau` helper remains for its own
direct tests, not as evidence of native conformance.

`CHECKED_AREAS` controls which files execute semantic assertions. Inactive,
explicitly skipped or unparsed cases remain parse-only and initialize no native
fixture. `LUAU_TYPECHECK_AREAS=all`, or a comma-separated upstream file list,
changes activation for a named run; it does not establish that every capability
or source parses. From the repository root:

```bash
LUAU_TYPECHECK_AREAS=all node scripts/test-suite.mjs run packages/sparkdown src/tests/luau-conformance/typecheck/TypeInfer.primitives.test.ts --wait 900
```

Build the generated fixture artifact with the pinned source/SDK procedure in
[the native boundary README](../../../../native/luau-conformance/README.md).
Generated outputs are ignored, provenance-validated and built explicitly in CI.
Locally use the supported named runner; whole package coverage comes from CI.

The instrumented fixture proves actual upstream setup, queries and VM behavior.
Ordinary exact sources also require separate execution through the shipped
production artifact. Sparkdown integration requires actual converter AST input
through the production decoder and an independently measured comparison. Common
sources or passing fixture controls do not prove either production path. Full
activation, final merged-artifact integration, live verification and review remain
separate gates.

## Preserve the original case

- Keep each original name, fixture, source bytes and assertion order, with the
  upstream file/line/header above the record. Duplicate original names stay
  duplicated. Coverage verifies the complete inventory and markers.
- Use inline `source`/`expect` for one check or `checks` for an ordered sequence.
  `module` preserves the original source name; `moduleSources` registers exact
  dependencies without adding a preliminary semantic check. Add a dependency
  check only when upstream actually checks it.
- One active case owns one actual C++ fixture across its checks and actions,
  disposed in `finally`, including setup/assertion failure. `shareFixture: true`
  is legacy metadata; omission does not create fresh fixtures per check.
  Separate cases remain isolated. `clearModules: true` calls the same fixture's
  `Frontend::clear`, preserving builtin/global arenas; it is not reset or
  reconstruction. Explicit fresh construction and retained-graph recipes need
  their original operation protocol.
- `definitions` are mandatory successful native definition loads before that
  check. Typed `globals` currently select real supported builtin TypeIds and
  call native `addGlobalBinding` with `@test` documentation. Arbitrary function
  type strings are not parsed into replacement declarations. More complex
  synthetic recipes remain explicit support requirements.
- `mode` preserves the original check mode; strict is the fixture default and
  the original source directive remains authoritative. `flags` and `limits`
  carry real native FFlags/FInts over setup/check/query operations, restoring
  values on return or exception. Unknown names fail. They are not restricted
  to the older TypeScript fixed-flag whitelist.
- `entrypoint: "module"` preserves an original direct `Frontend::check(module)`.
  It requires an explicit `module` and forbids a `mode` override. Source registration
  still precedes checking; this operation keeps the actual current configuration,
  including any previous explicit mode check. The source directive remains
  authoritative. NonStrict named checks load the exact standard definitions on
  every call and scope the original New-solver flag; they do not assign Nonstrict.
  Ordinary mode checks initialize the frontend before assigning the requested
  mode, matching the pinned lazy fixture behavior.
- Constructor presets preserve upstream eager setup; ordinary `Fixture` and
  initial source registration stay lazy. Case-body flags follow construction
  and precede the first actual frontend operation. Operation-specific changes
  must retain their original timing. The audited original ExternTypeFixture
  override uses `solverOverride: "New"` after body flags, selecting/attesting
  the real frontend. Raw old=true and effective New are distinct facts;
  reset/replacement clears its admission.
- `ignoreMissingAnnotations: true` drops only `TypeAnnotationRequired` before
  assertions. Surviving diagnostics retain their original native result index
  for field/structural selectors. Native insertion order is not sorted.
- NonStrict position macros use `{ errorAtBegin: [line, column], code: "Kind" }`
  followed by the original scalar-field descriptor at the same begin. An ordinal
  `error` and `errorAtBegin` are mutually exclusive. The native selector chooses
  the first original error with that begin, then tests its kind; it never scans
  onward for a preferred kind. Filtered subsets must retain original wrapper
  identity, actual locations, native indices and insertion order.
- `{ type: "b", tableState: "Sealed" }` requires the actual raw TableType before
  observing its enum state. Supported states are Sealed, Unsealed, Free and
  Generic. A Bound wrapper fails this predicate even when its followed table
  has the requested state; printing and followed kind do not establish it.
- Required internal predicates remain requirements: arena identity, capture
  lifetimes, class setup, definitions and module graph observations. An
  unsupported applicable recipe is a blocker, not a permanent exclusion.

## Ordered definition actions

`actions` is a finite alternative to inline `source` and `checks`. Empty or mixed
alternatives, unknown keys and invalid shapes reject before native loading.
Assertions run immediately before the next operation in the same fixture.
Definition-only cases need no fabricated final source check:

```ts
{
  name: "original ordered definitions",
  fixture: "Fixture",
  actions: [
    { definition: firstExactSource, expect: [
      { success: false },
      { binding: { name: "foo", present: false } },
    ] },
    { definition: secondExactSource, expect: [
      { success: false },
      { binding: { name: "bar", present: false } },
    ] },
  ],
}
```

An action is `{ definition, mandatory?: true, expect }`, `{ check: PortedCheck }`,
`{ syntheticSetup: "cyclicUnion" | "asymmetricExtern" }`, or one of the finite
retained-function/exception operations below.
`mandatory` additionally requires success. Direct unsuccessful definitions retain
actual ordered parser/errors, module presence and source labels; they are not a
CheckResult and have no invented `nativeIndex`. Definition assertions select
actual binding/alias presence, nullable documentation, own named properties,
raw type predicates, builtin identity, function metadata and the actual nullable
ExternType.definitionModuleName. See `../typecheckNativeActions.ts` for the finite
vocabulary and strict validation.

The two synthetic actions call the exact pinned native recipes for
unionTypes:641 and externTypes:803. They construct the original `Fixture`, apply
case-body flags, and perform setup before definitions, globals, sources or checks.
The same fixture and graph remain across subsequent original checks. Native
freshness guards reject duplicate, late and wrong-preset setup; the runner never
resets or reorders actions to make them succeed. Unknown recipes, extra keys and
synthetic-only cases without an original check reject before loading. The native
test adapter's separate `variadicFunctions` operation is not part of this shared
two-recipe protocol. Inactive, unparsed and skipped cases remain parse-only with
no native setup. Adding a new recipe requires its own exact source audit.

`NativeFixture.facts` exposes the raw TypeId's `rawPersistent` bit before follow.
Its `tableLevel`, `tableScopeIsGlobal` and `indexerIsReadOnly` describe the actual
followed TableType; non-tables and absent indexers return null. Extern `name`
comes from the actual native ExternType. These bounded observations do not
export a graph, imply an arena freeze flag or invent scope metadata for a union.

Separate descriptors preserve original intra-action assertion order. For
definitions:317/361, documentation precedes the raw structural requirement:

```ts
expect: [
  { alias: { name: "Bar", present: true,
      type: { documentation: "@test/globaltype/Bar" } } },
  { alias: { name: "Bar", present: true, type: { rawKind: "extern",
      properties: { prop: { count: 1,
        documentation: "@test/globaltype/Bar.prop" } } } } },
]
```

Apply the same split to MyClass alias docs and y binding docs before their raw
predicates. Raw extern/function requirements reject genuine Bound wrappers;
printing a followed type is not a substitute. Recursive function metadata checks
module, location, vararg absence, then original-name location, as definitions:361
does. For definitions:152/192, typed GenericError precedes its message:

```ts
expect: [
  { definitionError: 0, kind: "GenericError" },
  { definitionError: 0, message: exactOriginalMessage },
]
```

Combining fields does not specify arbitrary assertion order. Split descriptors
where upstream differs from the helper's fixed order; do not globally reorder
unrelated predicates or weaken structural guards.

The original NonStrict method-call recipe uses one finite setup action before
its exact sole check, with constructor setup before case flags and this body
operation under those flags:

```ts
fixture: "NonStrictTypeCheckerFixture",
actions: [
  { nonstrictBuiltinGlobals: true },
  { check: { source: exactOriginalMethodSource, expect: [{ errors: 0 }] } },
]
```

This operation reuses the actual normal/autocomplete arenas and calls the pinned
void builtin/test registration functions. It is first, once-only, before other
definitions, sources, captures or checks. Unknown, duplicate, late and wrong-preset
requests fail. No manufactured load-definition success or diagnostic accompanies
the void API. A direct source that already checks cleanly does not prove this
original setup occurred. Reset reconstructs fresh eligibility; clearing modules
does not. Exceptional refreeze is a source-reviewed safety path until a genuine
exception is observed; tests do not invent one to claim coverage.

The original builtins retained-function case uses one actual fixture and this
ordered protocol. Capture labels are case-local, unique and limited to16; these
are opaque native global/builtin FunctionTypes, never copied graphs:

```ts
actions: [
  { captureGlobalFunction: { as: "frexp", global: "math", property: "frexp" } },
  { check: { source: "local a = math.frexp", expect: [{ errors: 0 }] } },
  { expectCapturedLevels: { capture: "frexp", levelUnchanged: true,
      subLevelUnchanged: true } },
]
```

Both levels compare against that capture's actual before values. Ordinary checks,
definition loads and frontend clear retain the same global arena; reset, disposal
and foreign fixtures reject old captures. Module-owned captures are unsupported.

`{ checkThrows: { source: exactOriginalSource, exception: "InternalCompilerError" } }`
is a terminal logical check action. Its source gets the same shared-author syntax
eligibility before native initialization, and `sourceChecksOf` includes it in
literal/manifest audits. It does not produce a fake ordinary CheckResult or error
count. The exact NonStrict fixture runs `check_nonstrict` with the original checked
definitions; only the native exception-class discriminant passes. Successful,
wrong-fixture/setup or generic JS errors fail. A terminating check must be last.
Inactive or skipped cases parse with no native instance.

## Check expectations and native queries

Each `expect` preserves the original predicates in order:

- `{ error: i, typeMismatchData: { wanted: "string", given: "number" } }`
  compares actual native TypeErrorData, including its default reason/context and
  nested-error state. The finite selectors are string/number/boolean. A filtered
  aggregate ordinal maps through its retained nativeIndex; separate location and
  structural descriptors preserve the original order. There is no printed-type
  or partial-field substitute.
- `{ moduleDiagnostics: { module, errors: n } }` and
  `{ moduleDiagnostics: { module, moduleIndex: i, kind } }` observe the actual
  retained Module.errors vector at that point. moduleIndex is a separate local
  domain, with no guessed aggregate nativeIndex. Requests revalidate the current
  result and fail on missing/stale/foreign modules/handles; more than256 errors or
  over1MiB output fails without truncation. Existing module-qualified diagnostic
  type selectors remain unsupported. These are raw-native observations: an exact
  module source blocked by shared syntax still requires its parser dependency.

- `errors: n`, `errors: 0` and `errors: "some"` preserve the original error macros.
  `error: i` can compare actual code/message/location/fields. Locations are
  original zero-based four-tuples. Substring and alternate-message predicates
  remain distinct; no extra count is implied.
- `anyError`, `noError` and `everyError` preserve kind/loop checks. Empty loops
  stay vacuously true where upstream does. Definition diagnostics use their
  separate action vocabulary.
- `type`, `global`, `alias`, `exportedAlias`, `importedAlias`, `builtin`, `typeAt`,
  `expectedTypeAt`, `overloadAt`, `diagnosticType` and `moduleReturn` select actual
  bounded objects. Optional `module` changes ownership. Missing selectors fail;
  a selector alone checks presence without inventing a signature or predicate.
- `equals`, `notEquals` and `printedSameAs` use native printing options, including
  `maxTableLength: 0` for unlimited tables. `sameAs`/`notSameAs` compare original
  raw TypeId/PackId identity. A `{ follow: 0 }` path step represents an explicit
  upstream follow. Printing and kind inspection may follow without changing
  raw equality semantics.
- `arguments`/`returns` inspect direct head/tail; `flattenedArguments` and
  `flattenedReturns` call native flatten. Chained concrete heads and residual
  tails remain distinct. Size/first/finite/pack identity are separate operations;
  printed shape does not establish topology.
- Function/generic/pack facts, declared versus instantiated parameters,
  property/name/location/scope metadata, selected-New subtype and normalization
  use actual data. Unsupported paths still fail, including the current declared
  TypeFun-parameter path and module-qualified diagnostic sequence. Vocabulary
  alone is not a capability-completion claim.
- `decoratedSource` uses native `attachTypeData` and `prettyPrintWithTypes` on the
  retained SourceModule, without replaying source spelling or manufacturing a
  checker input through a host emitter.
- `moduleGraph: { module, maximumInternalTypes }` compares the actual retained
  native arena count. Disabled/discarded graphs reject instead of returning zero.

Opaque handles belong to their host instance and result revision. Graph-changing
operations invalidate ordinary result/query handles; reset/dispose and foreign
instances reject them. Explicit captures preserve eligible real global/builtin
FunctionType identity across same-arena operations, rather than clone it. Full
graphs are not transferred to TypeScript. Native UTF-8 byte locations and
compiler/editor UTF-16 positions remain distinct proof boundaries.

## Parse records and precise exclusions

`skip.newSolver`, `skip.notApplicable` and `skip.disabledUpstream` retain original
documented reasons. A block-only solver guard uses `doesNotPassNewSolver` on that
check. Empty `expect` still executes an active no-crash check. Shared API gaps
never justify skipping required cases.

`unparsed: { defect: N }` records a parser defect; `unparsed: { divergence }`
records an exact documented divergence. Both require actual rejection and fail
once the source parses. `malformed` preserves original Luau-invalid source while
executing its native error assertions. Compiler parser diagnostics and raw native
CheckResult SyntaxError remain independent. The parse check also detects non-Luau
recovery nodes, string interpolation divergences and early wrapper closure.

Dependency preflight parses entry and support sources before native setup, without
extra semantic checks. `moduleDivergences` allows only three audited class-source
associations in `classDependencyExclusions.ts`: classes:418 and modules:1355/1389,
exact game/A source/hash and heading "No `class` declarations". Token evidence,
source association and actual rejection are mandatory. Entry and other dependency
errors remain independent; exact game/B require defect #879 cannot be hidden by
the A exclusion. Appended malformed text or changed case/source/name rejects.

Class hashing uses only the audit's phase-one CRLF-to-LF equivalence, without trim
or rewriting. The existing whole-snippet wrapper still rejects CRLF independently;
hash equivalence is not route acceptance. Experimental if-local/if-const and
value-export decisions remain pending and are not authorized by native execution
under an original flag.

## Remaining acceptance ownership

#1388 owns this shared boundary and review/release. #1377, #1379, #1380, #1381 and
#1384 retain specialized original setup/action acceptance; #593–#598 retain
transcription, and #1360–#1367 retain full area activation. Portable tests consume
reviewed relative-import APIs after release. Private cross-worktree probes and
bounded shared controls do not close those tickets or establish full corpus
fidelity. Query, diagnostic, lifetime and parser gaps remain explicit dependencies.

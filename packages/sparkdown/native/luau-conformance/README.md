# Native conformance fixture boundary

This directory is test-only. Its generated WASM contains the exact pinned upstream
checker, compiler, VM, `tests/Fixture.cpp` and `tests/ClassFixture.cpp`, plus bounded fixture operations. It
is not the production artifact and exposes no native graph to a TypeScript solver.

The supported build is:

```
node packages/sparkdown/native/luau-conformance/build.mjs <clean7d5source> <emsdk4.0.10> <object-cache>
```

`--plan` validates and inventories inputs without compiling. Compilation uses one
worker. The source checkout and SDK are read-only. Object reuse requires matching
compiler tools, source/header hashes and options, followed by object hash validation.
The generated manifest records every compiled input and artifact hash. The host
also rejects changed adapter inputs, bad artifact hashes, incorrect pin or SDK and
missing artifacts. Generated outputs remain ignored rather than vendored.

Fixture operations retain one upstream frontend per WASM instance. Ordinary,
builtins, non-strict and upstream extern fixtures remain distinct. Initialization flags precede
fixture construction; case flags use real scoped FValues during each native setup,
check, diagnostic and query operation, including serialization, and restore on
return or exception. Direct definition loads return unsuccessful results
and real diagnostics; mandatory setup loads require success. Diagnostics preserve
upstream order and byte positions, which differ from production UTF-16 positions.
Ordinary Fixture construction and first source registration stay lazy. Registering
a source marks an existing frontend dirty without constructing one; the first
actual frontend operation uses its current case flags. `assignSource` is the exact
fileResolver assignment and does not dirty a cached named module; explicit direct
`source` replacement marks it dirty. The shared case runner uses raw assignment,
then the original ordinary or named check operation. Presets preserve their
original eager constructor/setup behavior. Reset replaces the fixture in its
current operation context while retaining Session-owned initialization flags.
Ordering obtained from native hash containers is specific to the wasm32 Emscripten
target; it is not an assertion of platform-independent iteration order.

The test-only `luau-conformance-assert-v1` profile keeps optimized NDEBUG layout
and enables official LUAU_ASSERT in every upstream and owned TU. It has a distinct
cache identity; old assertion-disabled objects are not eligible. The loader
requires that profile, handler policy and exact common flags. A genuine bounded
doctest operation context runs each native entry point, with the pinned
ADD_FAIL_AT require/exception failure semantics and scoped handler restoration.
Actual assertions fail the operation, destroy its partially failed session and
invalidate its handles; they are not ordinary type diagnostics or successful
zero-error checks. A non-unwinding WASM trap discards the host. Fixed profile and
trap controls belong only to this test artifact, outside the shared port actions.
Until the new artifact's controls run, these are source implementation contracts,
not assertion-enabled execution claims. Historical 8e00 passes did not evaluate
LUAU_ASSERT and cannot prove no forced-constraint dispatch.
Opaque result/type/pack/capture handles carry a host WASM instance brand, so equal
numeric tokens from different instances are rejected. Results invalidate on
graph-changing operations. Global function captures retain the exact raw TypeId
and FunctionType object across checks, definition loads and module clearing in
the same fixture global or builtin arena. Capturing a module-owned function fails;
reset replaces the fixture and invalidates captures;
dispose rejects every handle. A retained capture can expose its original TypeId
in a current result without looking up, following or cloning the function.

The synthetic cyclic union and asymmetric extern graph constructors follow the
exact pinned `indexing_into_a_cyclic_union_doesnt_crash` and
`read_write_class_properties` setup. Own property directions, native indexers,
parent/metatable/union children, type and property documentation, function definition
locations, diagnostic mismatch types and direct versus flattened function packs
are bounded observations of the retained native objects. Missing selectors fail;
no recursive graph serialization occurs.

Bounded type facts expose the raw TypeId's persistent bit before follow, the
actual followed table level/global-scope equality and present indexer readonly
bit, and the actual ExternType name. Inapplicable table metadata and absent
indexers serialize null. Scope observation reads the already initialized
fixture frontend without changing lazy initialization timing. No arena freeze
flag or union scope metadata is inferred. The shared case runner offers only
the two audited syntheticSetup actions; the direct native variadic recipe
remains a separate adapter operation.

Main-module requireType and explicitly selected module bindings use their original
distinct lookup/follow operations. Position and expected-position queries operate
on the retained native Module/SourceModule. Pack tokens retain native TypePackId;
printing, first, size, finite, direct and flattened observations remain distinct.
Environment contexts support definition queries before any check without fabricating
a CheckResult. Frontend.clear preserves the same fixture/global environment;
reset reconstructs it. Logical graph counts refuse disabled graph retention.
The explicit-new extern preset is limited to the audited raw-old-flag/new-frontend
regression; ordinary old-solver requests continue failing.

Type and pack identity compare the original native pointers. Explicit `follow`
operations are separate; printing and type-kind inspection may follow without
changing equality semantics. Test-only bound controls allocate genuine native
BoundType/BoundTypePack wrappers to distinguish these operations. Corpus queries
never create those controls. Native diagnostics carry their original result index
through filtering; field queries and structural comparisons use that index.

The refinement extern preset copies the exact pinned RefinementExternTypeFixture
graph and MagicInstanceIsA implementation, including its original assertion and
persist/freeze order. Normalization uses the exact selected-New refinement recipe
with a fresh arena and UnifierSharedState. The arena stays owned until the result
revision invalidates, allowing subsequent native queries of the normalized type.

Diagnostic names cover all pinned TypeErrorData alternatives through an exhaustive
native visitor. Selected error facts expose actual wrapper locations, scalar data,
bounded ordered collections and opaque type/pack handles. Optional native fields
retain presence observations. Nested TypeMismatch errors require an explicit depth
of at most eight; absent nesting fails. Built-in type-function error data stays
separate from the containing checker error. Collections are limited to256 entries,
and all output remains bounded. Printing uses the nine audited boolean native
ToStringOptions and the required numeric `maxTableLength` option, including zero
for unlimited table printing; subtype queries use the selected-New upstream fixture recipe.

Typed global setup calls native `addGlobalBinding` with an existing TypeId and
`@test` documentation. It accepts only types owned by the same builtin or global
arena and must precede checking or follow an explicit frontend clear. It does not
clone a type or parse a reconstructed declaration. Arena-membership predicates
use the original TypeId without following it, against the selected module's
interface arena or the fixture's global arena. A bound wrapper and its followed
target therefore can have different membership observations.

Registered `actions` are an alternative to `source`/`checks`, with a finite
definition, check, retained global-function capture/level assertion or terminal
InternalCompilerError expectation at each step. Direct definition results preserve
their own parser/error arrays and source labels without invented CheckResult
indices; mandatory loads additionally require success. Assertions run immediately
before the next operation. Raw extern/function predicates also verify that the
selected pointer equals its followed pointer. Extern definition module names come
from the actual native ExternType field, independently of source labels.

`captureGlobalFunction` stores the actual fixture-owned FunctionType under a
case-local label; `expectCapturedLevels` compares its two current components
against native saved before components. `checkThrows` passes only a genuine native
exception discriminant after shared syntax eligibility and exact NonStrict setup.
It is a logical source-bearing operation for `sourceChecksOf`, not a synthetic
ordinary check. Structural `typeMismatchData` assertions route to the existing
native comparator in the same revision and preserve original diagnostic indices.

`moduleDiagnostics` copies the actual checked Module.errors vector in its own
order with a distinct `moduleIndex`. It never synthesizes aggregate `nativeIndex`
or enables module-qualified type selectors. Missing/stale/foreign/reset/disposed
requests fail; more than256 errors or over1MiB output is rejected, never truncated.
No module/error pointers are retained by the scalar response, and no extra native
check, individual source removal or SCC algorithm is introduced. Case flags apply
through the operation and serialization. Raw module proof remains separate from
shared-author syntax and shipped production AST integration.

The audited extern regression can explicitly select New in its case body after
lazy construction and body flags. That operation initializes the real frontend
under those flags, selects and attests New, and retains the same fixture. Reset
and replacement clear the admission; old requests without it still reject.

Named dependency class exclusions validate the exact pin/file/case/module/source
hash in the small audited record, existing lexical statement evidence and actual
parser rejection before native construction. Entry and unclassified dependency
errors remain independent, including #879. The three audited class sources are
not a generic syntax waiver or an experimental value-export decision. Provenance
hashing permits only the audit's CRLF-to-LF normalization; the existing full
snippet wrapper still rejects CRLF text, a separately disclosed limitation.

Authored exact-source representatives cover the eight area groups: general inference
(`tc_hello_world`), tables (`basic`), functions/packs (`overload_resolution`),
refinements (`impossible_type_narrow_is_not_an_error`), generics (`check_generic_function`),
unions (`indexing_into_a_cyclic_union_doesnt_crash`), externs/modules
(`call_method_of_a_class` and the nonstrict named-module fixture), and builtins/nonstrict
(the exact VM nil type function and stateful negation fixture). These are shared
adapter controls; area writers retain full corpus activation and specialized acceptance.

## Migration ownership and required proofs

#1386 owns the shipped official analysis artifact and public lifecycle contract.
#1387 owns Sparkdown AST conversion, decoding and incremental reuse. This task owns
the shared native fixture boundary and its migration contract. Passing this fixture
artifact proves its actual specialized observations, not shipped-artifact behavior
or Sparkdown conversion. Ordinary exact sources must also execute the production
artifact. Integrated sources must execute #1387's decoder through that artifact,
with measured outcomes compared independently.

#1368's reviewed harness is merged; #1388 now owns its native migration. #1377, #1379, #1380,
#1381 and #1384 retain their exact cyclic-union, definition, asymmetric-extern,
non-strict and named/cyclic-module assertions and final native acceptance. Their
staged TypeScript work is source/setup evidence, not a second production solver.
The shared adapter is released to these same writers only after its own review.
Area writers #1360–#1367 then migrate and activate their audited cases; #593–#598
retain exact transcription ownership. Missing capabilities remain blockers rather
than permanent exclusions.

Current implementation is incomplete. Bounded native fixture controls and
independent public raw/AST representative comparisons have run, but full per-area
corpus coverage and specialized acceptance remain with their original writers.
The integrated comparison used an unreviewed #1387 artifact; final merged-artifact
integration, live verification, CI and independent review are still pending.
The exact shared-parser failure tracked by #879 remains a failure rather than an
exclusion. No readiness follows from syntax checking or from this document.

## Finite NonStrict operation contracts

`check_module` invokes the real named Frontend check with the current configuration.
It does not assign a mode, add another check or clear statistics. The corresponding
NonStrict named wrapper scopes the original New-solver flag and loads the caller's
exact standard definitions on every call, preserving the current configuration.
Ordinary explicit-mode checking initializes the lazy frontend before assigning
the requested mode, as pinned Fixture::check does.

`nonstrict_builtin_globals` is the exact NonStrictTypeChecker.test.cpp672 recipe:
initialize the same NonStrict frontend, unfreeze normal then autocomplete arenas,
register actual normal builtin globals, register actual test types, and freeze
normal then autocomplete. It is once-only on a fresh NonStrict fixture before
sources, definitions, other setup, captures or checks. Reset reconstructs fresh
eligibility; Frontend.clear preserves the same arenas and does not. The shared
action is `{ nonstrictBuiltinGlobals: true }`, first in its ordered action list
before the original check. Definitions and checks retain their original order.

The upstream registration API is void. Completion or an actual exception is
observable; there is no invented load-definition success/diagnostic result,
duplicate builtin load or added assertion/compiler flag. Both actual arenas are
refrozen on exceptions; exceptional teardown remains a source-reviewed path
until a genuine native exception is observed. This fixture instrumentation is
separate from the shipped production API and Sparkdown AST integration proof.

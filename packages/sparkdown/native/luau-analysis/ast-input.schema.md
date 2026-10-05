# Maintained AST input

The opt-in document variant in src/analysis-backend/contract.ts is
{kind:"ast", module, version, ast}. It supplies facts from the existing
Sparkdown converter. It contains no native pointers and emits no Luau source.
The decoder is a bounded transfer reader, not a language parser.

The integration is incomplete. Converter source now supplies authoritative
const-function keyword positions, qualified-reference lexical bindings and
ordinary comment locations. The native artifact supports those fields;
broader declaration fidelity, compiler integration, query correction and full
incremental acceptance still gate readiness. A qualified reference with
unavailable binding metadata or a const function with unavailable keyword
metadata fails explicitly.

## Schema 2

The envelope contains exactly schemaVersion:2, positionEncoding:"utf16",
root, layouts, nodes, locals, errors, hotcomments and commentLocations. root is a node index.
Each layout is [kind, fieldName, ...] in the constructor's fixed field order.
Duplicate kinds, extra/missing fields and unsupported constructors fail.
SparkdownAnalysisAst.ts and the native decoder maintain matching explicit
inventories. SparkdownAnalysisCodec.ts converts semantic records to this
compact format.

A node is [layoutIndex, beginLine, beginColumn, endLine, endColumn, ...fields].
Locations are zero-based unit-local UTF-16 ranges, with an exclusive end.
They are already in the host query convention. The source document variant
uses native parser byte columns internally and needs its separate byte/UTF-16
conversion. Never apply that conversion to an AST input, including after reset.

Each local uses the fixed order name, location, shadow, functionDepth,
loopDepth, annotation, isConst, isExported. Declarations, captures and shadow
chains reference the same local record. Names alone never identify bindings.
The decoder allocates local shells before linking identities and annotations.

Values are JSON null, booleans, finite numbers, strings, or tagged arrays:

| Tag | Payload |
| --- | --- |
| 0 | absent/unavailable |
| 1 | special number index: NaN, +Infinity, -Infinity, negative zero |
| 2 | node index |
| 3 | local index |
| 4 | line, column |
| 5 | begin line/column, end line/column |
| 6 | ordered values |
| 7 | ordered [fieldName, value] pairs |

TypeReference.prefixLocal has three meanings: [0] means authoritative converter
metadata is unavailable; null means the parser found a global/unresolved
prefix; [3, id] means an exact lexical binding. Qualified unavailable references
fail. Unqualified references need no prefix binding. There is no reconstruction
from spelling, scope depth, source offsets or an invented default.

Constant-string fields retain Luau byte strings as Latin1 characters, including
embedded NUL. JSON escapes transport those byte characters; the decoder restores
the original byte array. This is separate from location UTF-16 and the UTF-8
heap encoding used by the worker ABI. Nonfinite numeric facts use tag 1 rather
than JSON null. Numeric source spelling is not recomputed by the decoder.

Errors contain range/message and optional converter malformed category.
Hotcomments contain range/header/content. commentLocations contains the actual
consumed Comment/BlockComment/BrokenComment kind and delimiter-inclusive range;
the existing tokenizer records it without a second source parse. Queries inside
comments return null. Narrative text that resembles a comment is not Luau trivia.

StatLocalFunction.constKeywordBegin is the consumed keyword position for const
functions and Position.missing() for ordinary local functions. Attributes do not
move it to the statement's beginning.

## Scope and query operations

Scope links, program environments and document modes have independent versions;
they are separate from the AST and ordinary require edges. Ordered checkModules
roots prepare linked preludes first. Scope generations and actual decoded,
parsed and checked work counts are observations, not graph handles. Diagnostics
remain owned by their current checked modules, even when equivalent exports
reuse an older immutable native arena.

queryType displays the selected expression's inferred value type. When native
astTypes has no entry and astTypePacks does, it displays the first return value;
an empty pack is null. Complete packs remain native. Declaration and parameter
queries use exact AstLocal identities and native bindings rather than names.
Results remain scoped to worker session and project/document versions.

## Semantic boundary

Explicit, Store and Choose statement-list lowering follows the existing
SparkdownReading behavior. Explicit unwraps its statement, Store becomes an
assignment, and Choose flattens body plus gather in the surrounding scope.
Shared AST objects are not mutated by encoding.

Existing Sparkdown compatibility expressions are explicit decoder tags.
Interpolated Sparkdown strings use a broad string binding; divert/regex/
alternator/flow arguments use the existing any behavior. New currently returns
any while its operands are checked in order, matching existing checker behavior;
typed constructors remain a separate required integration gap. These policies
are not a fallback for unsupported tags or failed native checks.

Synthetic bindings use native-generated unspellable AstNames and stay native.
Author names with control bytes are rejected. Prelude exports must filter those
identities; diagnostics/type queries must not expose helper names.

## Limits and ownership

The host snapshots each submitted AST before its serialized operation begins.
It caps encoded UTF-8 JSON at16MiB per AST and aggregate retained project inputs
at64MiB. Node plus local records are bounded at100000. Native JSON record/depth,
AST depth, reference kind/index and shadow/node cycle checks apply before use.
The unchanged source input limit remains8MiB. Worker heap buffers are allocated
and freed through the same bounded native ABI as source/definition inputs.

SourceModule owns Allocator and AstNameTable. The persistent native project
installs decoded SourceModules and official require traces/source nodes.
Missing dependency edges are retained independently of native node deletion.
Removal invalidates dependents and clears native modules/traces. Definition
rebuilds and reset reinstall retained AST inputs. Native graphs stay internal.

The public AST hook is a prerequisite for independent representative #1388
production-artifact proofs. Passing encoder-only or private fixture checks does
not establish production checking, full constructor fidelity, scope-level
#999 reuse, host rollout or full compiler performance.

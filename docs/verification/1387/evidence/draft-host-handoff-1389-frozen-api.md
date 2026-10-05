# Frozen draft host handoff to SAME #1389, source coordination only

SAME original #1387 Sol6.1/high. YES: disjoint async host/session/message/build integration can begin against this current draft without waiting for every native scope-reuse optimization. This is a stable input/API ownership snapshot, not a reviewed release, host runtime pass, default-rollout permission or completion-capable claim. Current indexer50 freeze stays unchanged. Parent coordinates startup/runtime admissions and exact host-owned files.

## Exact imports and draft hashes

Within packages/sparkdown:
- src/compiler/typecheck/SparkdownAnalysis.ts:27cffd86744a7fa35000d198d91ad45216f193363fa929c1f2b8f512bf744e1d, exports SparkdownAnalysis and Compile/Document/Resolution/Publication types.
- src/compiler/typecheck/SparkdownAnalysisInputs.ts:a0bc0776b79a76ad43761269e4bbd3842ce303a1bfabb5d48a4def36fce4c781, immutable document/unit/map snapshots.
- src/analysis-backend/contract.ts:6af2a52a5fc578d24676d3024fbc5941e1e324d5ccb6509572376ce7eb6be651.
- src/analysis-backend/node-loader.ts:8c1b598679171cab85a280772ebacb4c8634b46d9160d3a1badddf1e05fa2f59, createNodeAnalysisBackend.
- src/analysis-backend/browser-loader.ts:2800dab75b7ce5bc2adc2daa63347d91c9fa413bc4f64f4e499b363a8a306ef3, createBrowserAnalysisBackend(workerUrl?).

Readback85629a/2a8303/a5c324 confirms actual current signatures, no inferred wrapper names. Backend createProject(configuration, request?) is awaited and rejects initialization failure. Construct new SparkdownAnalysis(project). The two backend factories implement the same AnalysisBackend contract; one project owns one worker/WASM instance. Browser worker/assets must preserve relative URL layout; host build work can prepare that without editing native build ownership.

## Awaited phase and publication

analyze(compile, request?) returns Promise<SparkdownAnalysisPublication>.
compile contains COMPLETE ordered documents {uri,version,text,tree,units,mode,sourceUri?}, programNames, optional resolutions {contextUri,contextUnit,specifier,targetUri,targetUnit}, definitions [{name,version,source}] and removeDefinitions.

Units are authoritative maintained LuauUnit objects from the converter, including queryLocations, errors/hotcomments/comment facts. Do not emit/reparse a second source representation. Host selects an actual target return unit; a .sd scene/prelude is not inferred from workspace extension lookup. Runtime run-wrapper ?run identity remains separate.

Result outcome/check expose actual status. documents are committed immutable source-map snapshots; diagnostics is a URI→TypecheckDiagnostic array map; stats has encoded/reused/checked. Facade captures caller graphs before queueing, maintains native identities/content/environment/link/mode/edge deltas and reconciles failed installed inputs. It publishes input/maps/handles only after successful update/check/diagnostic construction.

Host may keep runtime compile synchronous internally while awaiting this independent analysis phase before publishing current didCompile/RPC diagnostics. The current Compiler still calls TS validateTypes unconditionally unless all validation is skipped; disabling ONLY its TS phase and preventing getCompiledPrelude recursion are actual #1389 integration work. Do not use skipValidation to lose syntax/reference/lint checks, and do not silently skip native analysis because old entrypoints are synchronous.

Keep one host lifecycle owner around project/facade; do not concurrently mutate the project outside facade queue. Ordinary source edits use analyze deltas and MUST NOT resend configuration (current backend treats supplied configuration as a rebuild). For a genuine configuration change, simplest stable draft lifecycle is await old host operations, dispose old project/facade, create a new configured instance, then analyze the complete desired snapshot before exposing new queries. A serialized project.update(configuration) route is possible only with explicitly established quiescence and subsequent successful facade analyze; old handles/maps must not be exposed during that gap. Definitions obey monotonic versions/registration order and actual update status.

Failure/cancellation/deadline/memory-limit/error/requires-reset differs from normal diagnostics and successful empty output. After failed publication, facade requires reset before next analyze; reset clears handles and retains registered native inputs/configuration for rehydration. Host rejects stale requested document revisions rather than publishing old queued results. No artificial synchronous or forced-strict backend is implied.

## Queries and ownership

queryType(publishedDocumentSnapshot,line,column,maxLength=4096,request?) returns Promise<AnalysisQueryResult|undefined>. Use the publication's exact snapshot, not a recreated object or an old compiled program. The facade checks current document/map epoch plus native session/project/document handles inside its queue. undefined means no authoritative owned token at the cursor, distinct from native status-ok/null value type or stale/error rejection.

querySourceMetadata is copied scalar provenance observation, not definition navigation. reset(request?) and dispose() are awaited. Full handles/native graphs stay inside the backend; no TypeIds/AST/scope pointers cross the host boundary.

#1387 RETAINS bridge/contract/adapter/runtime/native build/generated artifacts/loaders/facade/Inputs/encoder/decoder/reader and authoritative mapping ownership. #1389 can READ these frozen draft files and author disjoint host/messages/build assets/config lifecycle/compile-await/query-consumption glue in parent-agreed paths. No parallel edit to the retained50 files is released by this handoff. Current reuse fixes operate inside scopes and do not require an API signature change; any actual future contract change must be coordinated before editing. Default rollout, full compiler/performance/fidelity/metadata/lifetime acceptance remain open.

## FULL-read original #893 audit/addendum and independent gates

84a599 FULLread audit5c80b31a39381fea3d3835b5da3c40bed207eddaebe9720e092307e293eb3d34 and addendumd2e03c4eccb177960739bedf0f38d84acf85ed50d390f7887b3021c39e2f4e1c; d25aaf reverified hashes and read previous #1387 compatibility response.

Ordinary retained new-solver maps are the official autocomplete starting point; no second forced-strict check or nocheck toggle is required by source evidence. Runtime parity still belongs to original893. Existing inferred/source queries never call official autocomplete and are not completion support.

Hover query ownership intentionally requires half-open consumed tokens. Completion needs its OWN authoritative insertion sidecar covering token ends/empty slots/recovery while rejecting narrative/synthetic/structural gaps; preserve same-line scene-parameter hover ownership. Display expressions remain601's pending units. Map epoch/document/project revision and per-input rawUTF8 versus decodedASTUTF16 conventions must survive requests and actual returned edits.

The addendum identifies actual native consumers beyond response source views: AstQuery native scope ranges/closed AST bounds; Binding.location declaration ordering; AST-address-keyed inferred/expected/overload maps; FunctionType.argNames plus current function argLocation; parent alias/generic scope/type-name state. Immutable effective source facts do not mutate or certify these consumers. Until a specific native consumer's metadata/AST identity relocation is proven, a future completion query may conservatively recheck the affected native owner at query time; #1387 required compile scope-reuse checked1 remains an independent gate and is not weakened.

Official result TypeIds/ExternTypes/Properties/AST ancestry can outlive temporary autocomplete arena only under explicit ownership; future wrapper must copy bounded labels/context/enums/booleans/owned insertion strings before arena exit, never return pointer-bearing handles. Output bounds do not bound traversal; deadline/memory/cancellation and truncation need actual proof.

Original893 retains109 required cases/18 exclusions, official query/transport extension, insertion mapper/LSP ranking/insertion and faithful native+integrated/nonstrict/nocheck/incomplete/shifted/scoped parity. No API extension or source edit is authorized by this packet; parent must coordinate shared-file hooks with SAME1387. #1389 may reserve a future completion-consumption extension point without placeholder success or completion-ready marketing.


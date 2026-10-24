# #1384 native module observation contract — read-only checkpoint

2026-10-04. SAME /root/ticket_1384, original rollout 01a102f5-473c-7cc1-8065-c1eecf0a5ee3. Latest turn_context read at16:04:52.803Z attests actual gpt-6.1-sol/high. REST issue1384 is Task; fresh issue-field-values read returns Effort field20063482, option35105687 High. Full resolve-issue, writer-contract, official-checker-decision, current1384 body and post-synthetic-readiness-and-migration.md read. This is contract preparation only, not implementation or acceptance execution.

## Original consumers and smallest missing observation

| Original pinned consumer | Exact operation and assertion | Current support / bounded addition |
| --- | --- | --- |
| TypeInfer.modules.test.cpp802–838, cycles_dont_make_everything_any, BuiltinsFixture | Register exact strict game/A and game/B; check(game/A) ONCE; print the already checked B returnType as module. Upstream asserts no diagnostic count or absence. | Existing source/check/modulePack/printedOptions operations suffice. Register B without checking it; A is entry source, not a duplicated moduleSources entry. Preserve the one moduleReturn assertion and genuine emitted errors. No new module diagnostic selector is needed for this original case. |
| TypeInfer.modules.test.cpp210–234, require_module_that_does_not_export, BuiltinsFixture | Register exact A empty source and B script.Parent.A require; checkA then checkB in SAME fixture; AFTER checkB, A.errors empty, B.errors count1 and B.errors[0] is IllegalRequire; B Hooty prints *error-type*. | Existing source/check/binding and printing suffice for execution/type. Missing finite direct module-error observation for the two vector counts and B local variant. The transcription-current.json currently substitutes aggregate errors and asserts A before B: those are preparation, not faithful final assertion timing. #597 owns its eventual correction. |
| TypeInfer.modules.test.cpp869/887 internal_types_are_scrubbed_from_module / internal_type_errors_are_only_reported_once | Real aggregate CheckResult.errors positions0/1 and module return packs. | Existing global nativeIndex/errorFacts and modulePack. No per-module selector required. |

Source scan of the full modules file finds direct Module.errors only at228–230. Scan of the private #597 transcription found ZERO selectors combining module with diagnosticType. This does not establish that unrelated future suites never need such a query. Definition-load module.errors are a distinct LoadDefinitionFileResult vector already covered by #1379/#1388; they have no invented CheckResult index.

Proposed finite API name/shape (for shared owner agreement, NOT implemented): NativeFixture.moduleDiagnostics(result,module) returns { module, diagnostics: [{ moduleIndex, kind, code, message, begin, end }] }. Diagnostics are actual Module.errors in vector order; moduleIndex is their original zero-based vector position. Count is diagnostics.length. kind is the existing exhaustive ErrorKind visitor, code the native numeric code, message native toString, coordinates native byte positions. No nativeIndex field: this is a separate local index domain. No fields/type/pack extension is needed by the identified original consumer. A bounded assertion can name module/count or module/moduleIndex/kind, run immediately after checkB, and consume actual records. Missing module is an explicit error, never an empty vector. Keep nativeQuery's module-qualified diagnosticType rejection until an actual original typed-error consumer justifies it.

## Ordering and index provenance

Fresh Frontend.check (538–613) parses/checks the queue, then appends each newly checked Module.errors in buildQueueItems order (and each SCC moduleInfo order when enabled). It does NOT sort that fresh result. Native bridge checked(183–209) assigns nativeIndex directly while iterating that actual CheckResult.errors. Current runner diagnostics and TypeAnnotationRequired filtering retain those indices; diagnosticType on a filtered aggregate maps the selected ordinal through its actual retained nativeIndex. Preserve that existing global behavior.

Cached Frontend.check may instead return getCheckResult(name,true) at547–548. getCheckResult914 uses accumulateErrors278–336: native requireSet DFS/LIFO, module errors appended reversed, each module range stable-sorted by descending begin position, then the whole result reversed. This differs from fresh queue concatenation. Current Session.check explicitly marks the entry dirty, so its ordinary root checks do not use that cached-root early return; retained dependencies can still be cached. getCheckResult(name,false) preserves direct module vector order but is not the original aggregate return. A fresh check can omit a cached dependency's errors entirely because only newly checked items are collected. Scalar equality, TypeId equality, diagnostic message, location, moduleName filtering or JS sorting cannot manufacture an origin link across these paths or distinguish duplicate equal errors reliably.

Therefore map module-local selection to (result.session,result.revision,module,moduleIndex), not to a guessed global index. The original moduleIndex is assigned natively during the actual Module.errors iteration; any deliberate TypeAnnotationRequired filtering retains that index without renumbering, and only applies where upstream performs it. The identified module-vector consumer performs NO such filtering. Any later true cross-domain mapping needs origin metadata retained at the exact native collection operation; no original consumer in this audit needs it, so none is proposed.

## Native seam, flags and lifetime

Session already has safe access: result(handle) validates current session/revision, then get().getFrontend().moduleResolver.getModule(module), exactly as binding/moduleFacts/modulePack. Module.errors is public; direct iteration requires no frontend scheduling algorithm, upstream source patch, AST rewrite or additional check. Serialize bounded scalar copies using the existing diagnostic visitor while guarded native operation flags apply. Proposed bounds: reject more than256 errors or output over the existing1MiB bridge cap; never truncate silently. Retain no ModulePtr/TypeError reference or arena object outside the operation. Native getters validate first; copied scalar records are historical snapshots and must not masquerade as live observations after mutation. A shared accessor should validate again before each fresh moduleDiagnostics request.

Session::invalidateResults287–296 increments revision, clears types/packs/query arenas/check/configuration. source298–308 replaces exact bytes/source kind and marks dirty through the actual fixture. check341–359 invalidates prior handles and marks entry dirty before invoking official check. Definitions/global changes also invalidate. clearFrontend1087–1094 invalidates checked objects but retains fixture/global arenas and registered resolver sources. reset1192–1200 invalidates, destroys/reconstructs fixture and thus removes ALL registered sources; recreate/dispose and foreign WASM instances also reject old handles. Module observation after checkB must use B's current result handle, even when selecting A's retained module. Wrong module, stale result, disposed/foreign instance, absent module and out-of-range local index must fail honestly.

There is NO individual source-removal operation in current Session/NativeFixture. Registering empty bytes or SourceCode::None is not erasure. No applicable original consumer above needs individual removal; do not add it speculatively. If a later acceptance control specifically removes one source while retaining the SAME environment, report that finite lifecycle gap and agree an explicit erase/sourceTypes cleanup/markDirty operation first. Whole-fixture reset is only faithful where the original performs a reset; it is not a substitute for one-source removal.

Session constructor236–246 enables Luau flags and selects new solver; cycle flag is therefore true absent explicit override. Existing official SCC and sequential fallback are authoritative. Case802 has top-level returns in both modules, so pinned eligibility1213–1257 excludes combined SCC inference; native cycle metadata/diagnostic filtering1930–1952 and Error.cpp465–495 handle it. All-no-return SCC is supplied by official Frontend, unlike the retained legacy helper's explicit unsupported boundary. Do not migrate that TS limitation or graph solver. Existing errorFacts observes real cycle arrays; no case802 zero-error expectation is invented. Separate flag-false support controls stay labeled. #879 still gates shared author syntax; no exact-source Sparkdown/shared acceptance executed here.

## Frozen inputs and proof limits

Shared root: C:/Users/Lovelle/Documents/GitHub/impower.worktrees/codex/test/1388-native-conformance, HEAD22c46d48c5243541303490d8f918540e2c1398bc. All38 current working files independently SHA256-matched all-owned-1791127756148/manifest.json (manifest SHA1296bcd8df4e1d588c3b1423788f9026dc2a56d680cfa72645d6cb6fc361de9a). No file changed. This is hash verification, not repeating the supplied native acceptance or TS75858.

Key exact shared SHA256 inputs:

| Input | SHA256 |
| --- | --- |
| session.cpp | c4bd2bc89d7c0489cd5c24bb36bc3498f652d5aa02983cb2bf4f436e0a76d2a6 |
| session.h | adecfd2b4287b85731cb83d5ef7ab917ef7ba7968c078e58c656a60fe39fe7f0 |
| bridge.cpp | 655e06c1f148efa470bad776d3c5eda2780c76c32cd366081f3a504de8b53590 |
| nativeFixture.ts | 3e72d87a210dc6e6d637d6ab0f91afc848b618fadf255df8b21ce15f46332e0f |
| typecheckNativeQueries.ts | 29411766336c04c595e80530c80a44b6687e472c5f46cf94f08968ea2a8a6230 |
| typecheckNativeDiagnostics.ts | 5f73bd9b0bb32135f9853d6ae9e8471f8563ba41c66ec02c28d04cbb974620b7 |
| typecheckNativeRunner.ts | 159eb6c87adc79fdda907ab206f8586ac43e7bfa8da9e17f7a9380a3364f3ae7 |
| portedCases.ts | c65cbcb8dc89fd70cfab3c0d570e09c10de8e4817960832e0ce6dfb897d54d97 |
| post-synthetic-readiness-and-migration.md | 8133e4d0e0c1ac72929e7e97867f3772383fe7e054dfd43bdb88698085839e05 |
| ticket-597/transcription-current.json | 2c438f95ad6ce6531101858f1b495b158508df0d8bf3802e4a2e12bb5e8c3c2a |
| generated/manifest.json (81663bytes) | 341808e06c93a2f858ee9decfd11b4f9d56ca5299949b6503dccf895f26c7c75 |
| generated/backend.js (84632bytes) | 066dd999cae081d7552354a16b30833494d9b4e5c86f399cc17a1183b4720c74 |
| generated/backend.wasm (4728142bytes) | 19df76a0277fb05f2749a580bad4d78c2b153daf57edf22e6bafad0265787f47 |
| generated/LICENSE.txt (1124bytes) | 1597b423ca8f9c76225b498071f03b2b3609c4960b8dc30e63b230490fc82efd |

Read-only official checkout HEAD matches pin7d5f73364fdbbaa984fa545071630eba73cfea98; inspected upstream files clean. Exact CHECKOUT byte hashes (Windows newline convention, not canonical literal hashes): TypeInfer.modules.test.cpp55cdb4d263763dc80914b61d395165872c9324cb06a20cde366969e4d9c9f828; Frontend.cppdf00db8d65b27efc9f5ae1af29c7209600e9e1a25f758db5d18b3ea6a6f7339d; Error.cppa4d43fae82329d3a6f781e6165c3a19f358b4abeb0f08df2e01b127139d5bcac; Fixture.cpp294821fed2294c54b85f27959e7119e82db1c9c3d062d6ab3e6653a0b0f9c70d; Frontend.h050c2b8abda85a4ec50f1ede56d9e5a57de88f9e3e26e3715a18463ad5ec4ee7. Retained canonical case802 UTF8 literal hashes: A c6ad5cd2e10cdfac72dd2a3759bc65b8aac8c44445f53cad9843c6af8888c974; B ca2edcf866d1fd36bad23ca054cb8f0dc81e191763490239b8753a5edfcfb95a.

Existing three staged LEGACY files remain untouched in C:/Users/Lovelle/.codex/worktrees/1384-cyclic-module-fixture/impower on codex/test/1384-cyclic-module-fixture at base4de74e795. Error.ts SHA3fdee9138494c7cb7ba2c1d138c2abbc0337060965c53f510e361e4077704927; namedModuleGraph.ts80663393d9e636bbe2b4c7fee1a81c991e2efd7d7898e28f59bf2e46526c9fff; namedModuleGraph.test.ts4ec71a61de174ce19bbc40efa47ace6d378486feabe5c4912513d56a5fa31eaf. Historical18tests/redgreen stay historical and are not native acceptance.

Exact literal bytes hashed from current #597 transcription: cycle A248bytes and B248bytes match the retained canonical hashes above; require_module_that_does_not_export A5bytes/SHA4dc501d66cd78903b81b1a53459d0432939728c537bbe9ffab55ab81521cb352, B52bytes/SHAc3441299cf49c03b2fb694ec94fb5d8cf4c9879cf8808341807797d92ee0e3ec. No source transformed or executed.

Only reads/hash inspection and this private editor-written packet performed. No repo implementation, build, tests, typecheck, install, UI, PR or review launched; no cleanup run. Every owned read command exited, including long source search35619 exit0. INCOMPLETE ticket; read-only contract audit complete, process-free yield for parent/shared owner agreement and later SAME-writer portable acceptance.

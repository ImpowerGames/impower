# PR1408 reproducibility failure — source-only diagnosis

SAME original gpt-6.1-sol/high writer. Existing f5b2/58a1 immutable52 baseline preserved; production WT remains clean. No compiler, build, TYPE, native runtime, test, install or public source mutation during diagnosis. Partial draft is NOT an accepted dependency; reproducibility is an additional real blocker.

## Actual CI failure

Run37245374200/job111562103846: native build succeeded on Ubuntu24.04.5/Emscripten4.0.10, then cmp failed at byte537 at2026-10-04T23:57:19.7616743Z. Checkout was merge cc35757991c42ecadf010d699ff722c9d24093d2 (f5b2 into4de40453), not the private WT. Full log305+ lines downloaded/read in contiguous chunks, SHA256d626cba12201176c40b6bbb76665d8b70f8c7d308797f080638167a09c213dad,38301bytes. Truncated combined read e49d8f was supplemented by b451b3, including full parsed manifest and final cleanup. Source/SDK unchanged locally.

- committed WASM58a14e28ac1325ace6c41eeea3e6bd7ef5e327e32432db970af2585b410a8f93/4274948B;
- rebuilt WASMb5a64d2a8bdd48b5244e16f54848683afb3f6d6ac2da2fc2f6c6aa6228146074/4274937B;
- committed JS3327f6b0a0927be17a0e5dbda0d54c29ca0b39a68ff8d9d12c2f3d27a817001a;
- rebuilt JS2d776b58bc25c2323318722b644a6e40dcd8c2978216436b6ee4318d087bbec6 (same30407B). JS cmp never executed after WASM failed, but logged hash already differs;
- LICENSE identical1597b423/1124B.

GitHub artifact API actual8cc44a returned total_count0: upload step is after failing cmp without an always condition. No rebuilt binary was downloaded or compared, and no sole-cause claim is made from missing evidence.

## Eliminated and remaining differences

All seven owned-native source/header hashes match CI, as do pin7d5, compilerScript017f735c and Emscripten version after LF normalization. All six overlay canonical preimage/output hashes and definition684e8cf match. Raw upstream Sources.cmake/input hashes and compilerVersion line endings differ by Windows CRLF versus Linux LF; the overlay explicitly records both raw and canonical hashes. Flag sets match after normalizing the intentionally distinct overlay root prefix. This is not evidence of an altered parser/native source or wrong compiler version. Paths/cached flags are still a provenance concern until the relink proves equivalence.

Concrete mismatch: private production-build.mjs creates changed=[bridge,ast-input,scopes,8header-affected upstream TUs], then links all changed objects followed by133unaffected reused objects. Maintained build.mjs/CI instead compiles/links3owned followed by the141 upstream Sources.cmake ordered list. Full actual production-link.rsp mapped each144object back to receipt source/hash; source inventory counts agree but102positions differ. First index3 (zero based): canonical Common/src/BytecodeWire.cpp versus actual Analysis/src/AstQuery.cpp. The eight moved files are AstQuery,Autocomplete,AutocompleteCore,BuiltinDefinitions,ConstraintGenerator,FragmentAutocomplete,Frontend,Module. Actual link rsp SHA256d57a193fb94b137131431f325f32417a387ff50d63ae9d7b9522448e9d47936c; all compiled/reused objects remain intact.

Static WASM section read (no instantiation)8cc44a places committed byte537 inside section1/type payload12–817. This is consistent with different type/index assignment caused by link order; it is not merely a custom/debug section mismatch. Link-order non-equivalence is established; its being the SOLE cause of the11byte size/JS differences remains a hypothesis pending a bounded relink.

## Smallest correction/verification proposal

Do not change source semantics or relax CI cmp. Correct the private cached builder's object sequence to the same3owned+Sources.cmake order as maintained build.mjs, resolving each canonical source to its attested changed/reused object. Keep cache invalidation and header/SDK/source hashes unchanged; validate144unique sources/objects and exact ordering before launching. Record the ordered source/object hashes in its plan/receipt, independently of compilation scheduling. No cache grouping is allowed to reorder link inputs.

At a separately granted resource window, the anticipated operation is ZERO TU compilation and ONE canonical-order relink using existing verified objects, output to a private comparison directory before any production artifact replacement. Compare fresh WASM and JS hashes against logged CI b5a64d2a/2d776b58; if both match, causal attribution is established. If not, stop and inspect per-TU compile flags/path/toolchain effects before any cold build or CI normalization change. Only after actual match should updated canonical artifacts/manifests and affected named semantic tests be proposed; old58a1 and its31 receipts remain immutable. No validation was executed or correction applied now.

Public draft body/current CI needs to show this actual reproducibility failure; any host integration remains against an explicitly unaccepted checkpoint. Full999/generic/derived/shifted-TF requirements remain open and unskipped.

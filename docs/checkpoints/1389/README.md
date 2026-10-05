# Incomplete #1389 preservation checkpoint

The human stopped work for the next week. This is a partial, unverified source checkpoint for [#1389](https://github.com/ImpowerGames/impower/issues/1389), within #589. Do not merge, close the issue, switch the checker default, integrate dependencies or start reviews from this checkpoint. Resume with the same original writer: gpt-6.1-sol/high, agent UUID01a1046a-2015-70e2-bffc-23cbe3ee08d3. Parent alone coordinates resource START and merging.

Branch: `codex/refactor/1389-wasm-host-rollout`. Parent/base commit: `4de40453bbf3fd7d82abd5d7e738e4ea161fc7a7`. This README's containing commit is the preservation revision; obtain it with `git log -1 --format=%H -- docs/checkpoints/1389/README.md`. The PR and issue checkpoint report its exact SHA. No rebase/shared main change/worktree deletion was performed.

## Source inventory

The frozen correction changes only `packages/sparkdown/src/workspace/classes/SparkdownWorkspace.ts` (SHA256 `8ab77185c77c38eb282b259b2451306b20bf33e31ca9c060e9e73b002ba28a77`). It validates relevant returned script/document/file identity, session and request order after each awaited response; tracks waiter ownership; preserves ordered decoding with the dispatch's decoder; and separates configuration/membership/asset environment changes from ordinary unrelated script body edits. Its public compile return type remains unchanged. No native/default checker rollout or #1387 API integration is implemented here.

Two new executable fixtures are preserved:

- `packages/sparkdown/src/tests/compiler/workspaceAnalysisPublication.test.ts`:3cases, SHA256 `2146d85df9d6d43a5743e7b3930e5a0dde075be94b3434b9e0de5c3b1f4021e3`.
- `packages/sparkdown/src/tests/compiler/workspaceAnalysisPublicationOrdering.test.ts`:7cases, SHA256 `75fa96327624141e32629e9955e2b834191d7dbd2e1dd3bbe5e44afe9c218545`.

These files use the existing public Workspace held-connection harness, with the real ProgramTransportEncoder in the vocabulary control. The existing neighbor fixtures are `workspaceRestart.test.ts` (7cases, SHA256 `265af15d3320f139b2ab1666200deccc06ea06a196225c22efeabd90434e8ba4`) and `workspaceFileUpdates.test.ts` (2cases, SHA256 `293d08f042d2041c6e806b26b3823ac6e0894de2a40aec387dbb05f14c87b302`). Compiler899, native1387, reader898 and completion/provider owners were not edited.

The SHA256 values above pin the original Windows worktree bytes. A checkout with different Git line-ending conversion can have different file SHA256 while preserving identical committed content; verify `git hash-object <path>` against `git rev-parse <checkpoint>:<path>` for the exact Git blob identity before interpreting a cross-platform hash difference as a source change. The preservation receipt records the committed tree/blob inventory. No installation or execution is needed for this Git-only proof.

## Actual evidence and limits

On the base, the original nine-case run actually exited1 with eight stale/order/waiter/dependency/vocabulary-publication assertion failures and one current-revision positive PASS. The complete persistent recapture took1.42s. [baseline-nine-complete.log](baseline-nine-complete.log) preserves the full text; the two `baseline-*.source.txt` files preserve the exact original3+6fixtures as data, outside executable test discovery. The seventh ordering case (unrelated existing script body edit remains publishable) was added afterward and has no RED credit. Original private raw SHA256 was `4c3aef92742e781a8723b69edffc1088082693d010422430b1fcfd6b7e7a3808`; portable text uses normalized LF, so its bytes/hash differ from the original Windows log.

The proposed four-file19 GREEN run NEVER STARTED. The fresh admission guard at2026-10-05T00:13:36.6465217Z found all13pins/head/staged inventory matching, no heavy/owned process or reservation, but RAM1066680320bytes (0.993GiB), below the2GiB minimum. [nineteen-admission-refusal.json](nineteen-admission-refusal.json) preserves that receipt. This is an admission hold, not a test failure. TYPE was not run. Whitespace diff checks passed; no GREEN, native host, rendered UI, performance or independent review proof exists for this correction.

Two known source concerns require adjudication after the frozen19 disposition:

- The three new URI maps retain deleted URI history and copy it into dispatch snapshots. Proposed later fix: one monotonic nonce assigned only to each mutated URI, remove deleted entries, clear maps on connection restart while preserving scalar nonces. Compare only relevant URI tokens; never use the scalar as a global edit veto. A finite32URI churn/storage control is proposed, not authored or run. Do not apply this correction before classifying the frozen19.
- The first existing Restart mock holds ALL requests, including document updates. Because safe compile dispatch now waits those updates, its pre-restart assertion that CompileProgramMessage was already sent may fail. Preserve the actual result; if confirmed, separately test an abandoned dispatched compile with selectively held compile and an abandoned pre-dispatch compile with all updates held. Do not weaken publication/update guards. Its synthetic MAIN1 response after a version2 edit is another fixture detail to distinguish from real stale success.

## Resume sequence and prerequisites

Use this existing branch/worktree, or a normal checkout of its exact pushed SHA. Install only that checkout's normal workspace dependencies when needed, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install`, preserving package metadata; no shared dependency links, copied SDKs or cached node_modules ship here. Original machine used Windows PowerShell, Nodev23.6.0, Git/gh authentication and a successful own-worktree post-install preflight. For a fresh machine, complete the supported resolve-issue preflight and guarded resource setup first. Preserve recovery records; do not delete reservations or worktrees ad hoc. Require fresh free RAM>=2GiB, no competing heavy/owned test process, exact source/base/fixture hashes, and the machine-wide supported test reservation. The runner caps heap at1024MB and uses one fork with fresh file environments.

The next admitted command is exactly:

```text
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/workspaceAnalysisPublication.test.ts src/tests/compiler/workspaceAnalysisPublicationOrdering.test.ts src/tests/compiler/workspaceRestart.test.ts src/tests/compiler/workspaceFileUpdates.test.ts --wait 600
```

Save COMPLETE persistent raw output and actual process exit/release. Expect4files/19cases (10new+9neighbors). Classify any failure before source changes or retry. Only if all19PASS, run the accepted filtered gate:

```text
npm run typecheck -- packages/sparkdown/tsconfig.json packages/sparkdown-language-server/tsconfig.json packages/spark-web-player/tsconfig.json --jobs 1
```

No full suite/manual CI dispatch/retry/review is authorized during the stop. Pushing this checkpoint can trigger automatic CI; its result is separate from the unstarted local19.

The published dependency handoff is [DRAFT #1408](https://github.com/ImpowerGames/impower/pull/1408), exact SHA `f5b2b6918f5ac70ef3046e29256fba6919a6af26`, stable handoff packet SHA256 `1e18409d861f4a6cfb0e6fa8e7774893a089c731d4dd37dc182786c426116d4e`. It is unaccepted: root reports70CI failures and reproducible-WASM byte537 mismatch; current API shows failed reproducible-build, packages/sparkdown and test-suite. The SAME1387 writer owns diagnosis. Verify its eventual published fix before normal dependency integration; never copy uncommitted APIs or import another worktree by absolute path. Native generic/default-reuse gaps and the3s cold/slow readiness/current diagnostics/recovery/no-unhandled-rejection gate remain open. Scalar queries are not completion-capable; retained native source consumers need proof.

Original nonshared full logs,13pin admission packet, complete diff and lifecycle/ownership plans remain under `C:/Users/Lovelle/.codex/private/orchestrate-589-20261003/ticket-1389/`; they are not assumed available on another machine. The source fixtures and essential baseline/admission text above are in this Git tree. No browser state, private user corpus, credentials, SDKs, install/cache directories or unrelated raw logs are included.

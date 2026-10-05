# Preserved partial checkpoint — stop requested

SAME original writer gpt-6.1-sol/high, original worktree codex/refactor/1387-incremental-checker. Parent transmitted the human stop/preservation request. No new implementation, runtime, reviews, broad tests or integration; no merges/deletes.

Published/pushed branch HEAD f5b2b6918f5ac70ef3046e29256fba6919a6af26, DRAFT https://github.com/ImpowerGames/impower/pull/1408. Exact git status --porcelain empty at602619 and228284: ZERO tracked or untracked worktree changes. No uncommitted production change to preserve. The current native artifact is committed58a1; immutable52-source copy checkpoint-f5b2-58a1-immutable and its6de8c3af receipt remain. All current command handles completed; no writer test/native/compiler/server/reviewer process or queued test launched in this turn. Original reviewers0/cap6; no reviewed commit and no ready/closed claim.

Minimal private-only changes after f5b2: production-build.mjs canonical ordering/output isolation (0edd2e5e); its exact preimage1c77d449 preserved in production-build-pre-canonical-order.mjs. PLAN-ONLY output reproducible-relink-plan.json81ab9a0a, canonical-private-relink-packet.mdfcc862b9. Relink has NOT executed; generated production files untouched. Callback checked-lineage audit3e9071ae preserves the source-backed native gap; callback implementation/design expansion stopped at parent request. No runtime artifact claims for that proposal.

Completed CI classification pr1408-sparkdown-failure-classification.md8b54f89e and full raw502307cd retained:70fail/11398pass/827skip;10known requiredRED,2positive query-role errors,58unexpected regressions. Native reproducibility rawd626cba1+diagnosis78401fd7 retained. Public draft body5f75f874 now discloses completed70 classification and3failedchecks; gh edit b555d3 actual0 then FULL readback228284 confirmed draft=true/head=f5b2/base=main. No uncertainty/retry in publication. Both failures remain unresolved.

## Portable essential evidence plan

Do not copy SDKs, pinned checkouts, node_modules, object caches, browser profiles, authentication/configuration, full runner session logs or process dumps. No secret-bearing store is required by this plan. Do not delete any existing evidence. No portable archive has been created in this turn; this is an explicit preservation manifest for the coordinator.

Preserve this small allowlist from the ticket-private directory (retain relative names):

- checkpoint-f5b2-58a1-immutable/** and receipt.json: exact52-owned source/artifact baseline. It contains repo code/artifacts only.
- checkpoint-owned-source-audit.json, checkpoint-staged-source-audit.json, checkpoint-publication-1408-receipt.json; indexer-role-31-root-receipt.json, indexer-role-31-root-complete.log, indexer-role-31-results.md; successful production-build-result.json and production-build-plan.json.
- pr1408-reproducible-build-failure.log, pr1408-reproducibility-diagnosis.md; pr1408-sparkdown-failure.log, pr1408-sparkdown-failure-classification.md. Review downloaded CI logs for sensitive data before sharing outside the private machine; their current cited hashes attest original bytes, so any redacted copy must have its own hash.
- production-build.mjs, production-build-pre-canonical-order.mjs, reproducible-relink-plan.json, repro-link-plan-only.log, canonical-private-relink-packet.md. Cached object paths in the plan are dependency references, not portable binaries or proof of a future link.
- checkpoint-draft-body-preparation.md, draft-host-handoff-1389-frozen-api.md, generic-defaultpack-origin-proposal.md, generic-defaultpack-checked-lineage-audit.md, remaining-scope-matrix-plan.md, source-metadata-consumer-audit.md, progress.md and this preservation checkpoint.

Other historical red/green receipts remain on the original machine and must not be removed; the allowlist is the minimal recovery set, not authorization to discard omitted files. Github retains the52 committed files and partial API. Reproduction on another machine must use maintained build.mjs and verified pin/toolchain; local caches/private link plans are not a substitute for deterministic shipped artifact verification. Parent keeps source ownership and will resume SAME writer only when the human resumes work.

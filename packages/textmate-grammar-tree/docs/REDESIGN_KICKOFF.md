# Incremental Parser Redesign — START HERE (fresh-agent kickoff)

**Branch:** `dev/incremental-parser-redesign` (worktree
`impower.worktrees/dev-incremental-parser-redesign`), branched off
`dev/parser-intra-scope-incremental`.

You are picking up a deliberately-restarted effort. A prior multi-session attempt
built a "line+stack" tokenizer to make in-block edits reparse only the edited
line, **discovered it was a production regression, and reverted it.** This branch
starts from the production-correct engine plus the durable assets that effort
produced. Read this, the design doc, and the project memory, then begin with the
**ONE prerequisite spike** below — do not re-attempt the full refactor first.

## The goal (unchanged)

Editing one line inside a large `if/for/while/choose/then/function` block
currently reparses the **whole block** (`packages/textmate-grammar-tree` splits
chunks only at pure/zero-open-scope boundaries; a block is one chunk).
Boundedness harness measures this at **58× the edited line**. The engine's
headline differentiator is blazing-fast live-preview/HMR for visual novels, so
this matters. The non-negotiable contract: the incremental tree must be
**byte-identical** to a from-scratch parse.

## What's already here (don't rebuild)

- **Production-correct whole-block engine** — `textmate-grammar-tree/src` is
  byte-identical to `main`. (The line+stack work was reverted.)
- **vscode-textmate conformance suite** — `packages/sparkdown/src/tests/
  textmate-conformance/` (vendored upstream fixtures + harness; baseline 1/95,
  bucketed by divergence axis: regex/Oniguruma, while-rules, captures, includes).
- **Incremental byte-identity harness** — `packages/sparkdown/src/tests/
  incremental/incremental.ts` + `incremental.test.ts` (14 edit-vs-scratch cases +
  the 58× boundedness metric).
- **Production-input parity guard** — `productionInputParity.test.ts`: parses
  every fixture via BOTH `string` AND `SparkdownDocument` and asserts identical
  trees. **This is the test that would have caught the regression. Keep it green.**
- **Design doc** — `docs/PHASE_C_INCREMENTAL_DESIGN.md` (multi-agent design pass;
  read its ⚠️ STATUS banner first). Project memory file
  `project_parser_intra_scope_incremental.md` has the full narrative.

## The single hardest lesson (internalize this)

The snapshot suites parse a **`string`**, which lezer wraps as a WHOLE-REST chunk
→ the tokenizer consumes a whole block per call (the legacy whole-block path).
But **production parses a `SparkdownDocument`** whose `chunk()` returns **one
line** (`lineChunks = true`) → a **per-line** path. These are DIFFERENT code
paths. The reverted refactor was byte-identical for `string` yet wrong for
production, and no string-only test could see it. **Therefore: exercise
`SparkdownDocument` input from day one (productionInputParity), and never trust a
string-only green.**

## THE PREREQUISITE SPIKE (do this first, in isolation)

The reverted attempt got the matcher correct (scopes opened/closed properly) and
each chunk's suffix buffer was *structurally valid* (validator: 0 problems; the
block's root node spanned all its nodes) — yet the assembled `Tree` still
**detached** the block's children, AND it did so even with TreeBuffer conversion
disabled (so it is NOT `copyToTreeBuffer`). The defect lives in
`Compiler.step`/`finish` global assembly or the `Tree.build` interaction, and was
never isolated.

**Build a tiny synthetic harness** (no real grammar, no real parse): hand-craft
the per-line token/chunk sequence for a small `for…do…end` and `function…end`
block (a scope that OPENS on one line and CLOSES on a later line, with body lines
between), feed it through `Compiler` + `Tree.build`, and get a **correct nested
tree**. Solve "valid suffix buffer → detached tree" here with nothing else
moving. Until this is green, the whole approach is unproven — this is the linchpin.

Reference (in `git stash` on this repo, OBSOLETE but useful to read, not to pop):
the reverted per-line code had the matcher fixes — `lineEnd` = first newline;
boundary `reachedEof = pos >= state.str.length` (the committed "advance() didn't
grow" is always true for a whole-rest buffer → every line looks like EOF); and a
cascade-close (§2 of the design doc: consuming-vs-zero-width `end` discriminator).

## Only after the spike is green

Re-attempt the tokenizer, guarded by the harnesses (esp. productionInputParity +
the incremental matrix + grammar/vscode snapshots). The design doc recommends
"tokenization memoization" (cache the matcher per `(line, entry-stack hash)`,
fresh assembly) — but note it still needs a correct per-line path, so the spike
is unavoidable. Also weigh whether the whole effort is worth it vs. keeping the
whole-block model (the spike's outcome should inform that).

## Constraints / how to work here

- **Byte-identity is the contract.** Tree must equal a from-scratch parse.
- **No grammar (`*.language-grammar.json`) or lowerer changes** (last-resort only).
- **`tsc` is NOT a gate** — verify via vitest.
- **Run vitest memory-safely** — one suite at a time, single fork, capped heap:
  `node --max-old-space-size=3072 ../../node_modules/vitest/vitest.mjs run <path>
  --pool=forks --poolOptions.forks.singleFork=true --poolOptions.forks.maxForks=1
  --no-file-parallelism` (from `packages/sparkdown`). "exit 0 + Worker exited
  unexpectedly" = OOM, not a pass.
- **Deps:** this is a fresh worktree — run `npm install` at the repo root once if
  `node_modules` is missing (watch for ENOSPC corruption on a near-full C:).
- **Nets to keep green:** `grammarSnapshot`, `vscodeGrammarSnapshot`,
  `textmate-conformance` (don't regress 1/95), `incremental`,
  `productionInputParity`.

Commit/push freely on this branch; never touch `main`.

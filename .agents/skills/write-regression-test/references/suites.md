# Run suites, typechecks and tooling checks

All commands run from the worktree root unless stated otherwise.

## 3. Run the suite, the typecheck, and the standalone checks

Start with the file, widen to the package, under the caps in Running vitest safely.

Then typecheck. `npm run typecheck` at the repo root runs `tsc --noEmit` over all 41 projects and takes about four minutes. Mid-change you usually want a subset, so it takes filters, each one a substring of a project's config path, not a directory:

```bash
npm run typecheck -- packages/sparkdown/tsconfig.json
```

```
ok   101641ms  packages/sparkdown/tsconfig.json

1/1 project(s) clean in 101.6s
```

Because it is a substring, `packages/sparkdown` matches six projects (`sparkdown`, `sparkdown-language-server`, `sparkdown-document-views`, and three more), which is useful when you want the neighbours too and surprising when you did not. `--list` prints every project without checking any, and `--jobs N` sets how many run at once (default 2, which is what CI uses); the value is capped at the machine's core count, so asking for more than that silently gives you the cores.

A project your change reaches through an import is checked when that project runs, not when yours does, so widen to the whole gate before you push. CI runs the same command on any pull request that touches code, a `tsconfig`, or a `package.json`; `.github/workflows/typecheck.yml` has a paths filter, so a branch that changes only docs gets no typecheck run at all. Where it does run, a type error blocks the merge, so a clean local run is worth something and a red one is a real failure rather than noise to route around.

Then run the standalone checks from the repository root:

```bash
node scripts/check-agent-tooling.mjs
```

The runner discovers tracked checks under the shared skills, harness hooks, `scripts/` and `.github/scripts/` with Git, prints the derived count and a start and completion result per file, rejects empty discovery and unsupported executable test extensions, and exits nonzero on any failure. Unsupported checks remain in the not-run inventory, including after an earlier timeout. Files ending in lowercase `.json`, `.snap`, `.md` or `.txt` are listed separately as data fixtures and excluded from check coverage; a missing tracked fixture fails the run. Stage new checks before running it. The CI workflow runs this same command on Windows and Linux; it also checks the sparse checkout and installation. No dependency install is needed for bare Node checks. A skipped case is listed and is not evidence for that capability. Confirm every added check is discovered and that its inputs are present in the workflow's sparse checkout and path triggers.

Run with the machine otherwise idle. The runner probes Bash before launching checks and prepends its directory to the inherited PATH so nested Node processes can find it. It chooses Git for Windows Bash on Windows; `AGENT_TOOLING_BASH` can select an explicit executable. A missing required interpreter fails the run. Each check has a five-minute bound, configurable with `AGENT_TOOLING_TIMEOUT_MS` from 100 to 3600000 milliseconds, and prints progress every 30 seconds while awaiting exit. Every timeout counts as failure, attempts termination, and aborts subsequent checks with explicit not-run results. The closing run count means attempted invocations, including failed ones; separate timeout and unconfirmed-exit counts identify incomplete attempts. A start or progress line alone proves no completion. Keep logs until the closing counts, failures and every completion result have been read.

The runner's EXPECTED_CHECKS value pins the derived tracked runnable count in both directions, excluding the grammar scanner check that runs in the typecheck workflow. Update it when adding or removing a check, and review any lost coverage. The CI summary lists every skipped case. Portable extension fixtures, real shell classification, directory-link access and launcher-tree shutdown run on both Windows and Linux. POSIX execute-permission and Linux group-ownership probes report their platform skips on Windows. Windows-only held-tree and long-path cases run in the Windows matrix leg; zip fixtures need the workspace dependency install. Directory-link fixtures can also report an environment capability skip with the filesystem error; retain that explanation and do not count the skipped fixture as verified.

If the launched parent has already exited while descendants retain its pipes, the runner cannot safely identify that tree through the parent's process identifier. It refuses the kill, aborts the remaining checks and lists each as not run. Inspect the recorded timeout and processes before retrying; an unconfirmed tree shutdown is not successful cleanup.

Every timeout aborts the aggregate after attempting to stop the active Windows tree or POSIX process group. A detached descendant can escape a POSIX group, and the parent's exit alone cannot prove every descendant stopped. Inspect processes before retrying; the remaining not-run results are incomplete coverage, never passes.

---

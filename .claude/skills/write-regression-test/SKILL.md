---
name: write-regression-test
description: Write the test that pins a fix or a feature, prove it is honest with the redgreen cycle (fails on the pre-fix source, passes on the fix), run the affected suites and the typecheck under the machine's memory caps, and run the standalone checks under .claude/. Invoked by resolve-issue at its test step and by file-bug for a repro test, and usable directly whenever a change to a package needs a test and a safe run.
---

# Write a regression test

Every fix and feature lands with a test that pins it. Code with no test is not done; the next refactor silently reintroduces the bug or breaks the feature. All paths are relative to the repo root (the directory whose `package.json` is named `impower-monorepo`), and every command runs from inside the worktree under test.

---

## 1. Write the test

For a fix, it pins the defect. For a feature, it pins the new behaviour. Put it beside the existing ones for the package you changed:

| Changed                                | Tests live in                                    |
| -------------------------------------- | ------------------------------------------------ |
| `packages/sparkdown` compiler/lowering | `packages/sparkdown/src/tests/compiler/`         |
| `packages/sparkdown` runtime           | `packages/sparkdown/src/tests/runtime/`          |
| Luau semantics                         | `packages/sparkdown/src/tests/luau-conformance/` |
| Another package                        | that package's `test/` or `src/tests/`           |
| `impower-dev`                          | `impower-dev/test/`                              |

Copy an existing neighbouring test's imports rather than inventing them; in `src/tests/compiler/`, `compileSnapshot.ts`'s import order is load-bearing (it primes `Container` first to break a class-extends TDZ cycle). Copy repro syntax from a passing fixture rather than from memory.

If the package has no tests at all, set it up; do not skip the test. Most packages here have no `vitest.config.ts` yet, and standing one up is part of landing a fix rather than a reason to land it untested; a session that is only filing a bug hosts its repro where a harness already exists (file-bug says where) and leaves the setup to the fix. Use `packages/opfs-workspace` as the template, three pieces:

1. `vitest.config.ts` at the package root. Copy `packages/opfs-workspace/vitest.config.ts` verbatim and keep its `pool: "forks"` + `singleFork` + `fileParallelism: false` settings; parallel runs OOM this machine.
2. `"test": "vitest run"` in the package's `scripts`, and `vitest` in its `devDependencies` (match the version other packages use, `^2.1.9`).
3. A `test/` directory holding `*.test.ts`.

Then `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` at the repo root (workspaces; never inside the package, which creates a stray per-package lockfile the root `.gitignore` deliberately ignores).

Assert the behaviour from the ticket, not the shape of your patch. If the issue says "only the last matching layer survives", the test builds a case with several matching layers and asserts all of them come back.

Written before the fix, the test is also the reproduction: it gives the "fails before, passes after" evidence for free instead of reconstructing it later.

---

## 2. Prove the test is honest

A regression test that passes against the old code pins nothing.

Never use `git stash` for this. The stash stack is per repository, not per worktree, and this checkout has many live worktrees with other sessions running concurrently. A `git stash pop` takes whatever is at `stash@{0}` at that moment, which may be another session's WIP pushed between your push and your pop. That lands their work in your tree and leaves your fix on the stack.

Run the whole cycle through the driver, from the repo root, naming the test invocation (under the caps in Running vitest safely) and every changed source file the test exercises:

```bash
node .claude/skills/drive-web-editor/driver.mjs redgreen --test "cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/tests/compiler/FilterImageLayers.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1" --files packages/sparkdown/src/compiler/utils/filterImage.ts
```

`--test` is the test command, run twice from the repo root (it may `cd` into the package itself); `--files` takes every changed source the test exercises, one path or several, and never the test file; `--base` is the revision the pre-fix content comes from, `HEAD` by default and `origin/main` once the fix is committed.

It snapshots the files, reverts them to the base revision, runs the test and requires it to fail, restores the files from the snapshot, proves each restore by content hash, and runs the test again. Verified output shape:

```json
{
  "ok": true,
  "base": "HEAD",
  "baseCommit": "4538f1319…",
  "test": "cd packages/sparkdown && …",
  "snapshotDir": "C:\\...\\Temp\\redgreen-abc123",
  "files": [{ "path": "packages/sparkdown/src/compiler/utils/filterImage.ts", "snapshotPath": "C:\\...\\redgreen-abc123\\01-filterImage.ts", "snapshotSha": "…", "baseSha": "…", "changedDuringRed": false, "restored": true, "matches": true, "restoreError": null }],
  "red": { "exit": 1, "outcome": "failed", "reason": "assertion", "tail": ["…"] },
  "green": { "exit": 0, "outcome": "passed", "tail": ["…"] },
  "problems": []
}
```

`ok: true` means exactly this: every named file differs from the base, the test exited non-zero on the base with output that reads as a test failure, every file came back byte-for-byte, and the test exited zero on the fix. It is an exit-code proof. Which test failed is in `red.tail`, and reading it is your job: a red where the ticket's new case passed and an unrelated case in the same file failed looks identical to the command. Quote the assertion from `red.tail` and the `green` count in the PR body. `ok: false` exits non-zero, and `problems` is never empty when it does:

- The test passed against the base: it pins nothing. Either it does not assert the ticket's behaviour, or `--files` does not name where the fix lives.
- A file is identical to the base. Nothing to revert in it: either the fix is committed (pass `--base origin/main`) or the file is not where the fix lives.
- The red run died on an import or syntax error (`red.reason`) rather than the defect. A whole-file revert broke the test's imports; use the in-place path below.
- The runner found no test: `--files` named the test file itself, so the revert removed it. List only the changed sources.
- The test command could not run (`reason: "shell"`): the shell reported a missing command or script. Fix `--test`.
- The red run's output does not read as a test failure (`reason: "unknown"`, or no output at all). Read `red.tail` yourself: if it is the ticket's assertion in a form the command does not recognise, say so in the PR; if it is a config error, a worker crash, or a truncated run, it proves nothing.
- The runner crashed on the base (`reason: "crash"`: a killed worker, an out-of-memory, a fatal error). Proves nothing; lower the caps or split the run.
- A file could not be reverted (read-only, locked). The red run is not attempted; files already reverted come back, the rest were never touched.
- A file changed while it was reverted. A review round, an editor, or a watcher wrote to it. The command does not restore that file, because overwriting it would replace the newer edit with the snapshot, which is exactly the stale-copy failure this command exists to prevent. The file then holds the base content plus that edit, not the fix; the fix is at the `snapshotPath` the report names. Merge the two by hand and run again.
- A restored file does not match its snapshot, or could not be checked (`restoreError` says why, e.g. a read-only file, or a path that became a directory). The fix is at `snapshotPath`; put it back by hand. The other files still come back on their own.
- The test failed against the fix. The restore is verified by hash, so this is the fix itself: the test does not pass on your change.

The snapshot and the restore happen inside one process, so there is no copy to go stale between review rounds; run the command again after each round rather than reusing anything from the last one. Once the snapshot is taken the command does not throw: the restore runs in a `finally`, every later error becomes a `problems` entry, and the report always prints. A Ctrl+C during the test run reaches the test child first, so the command returns through that `finally` and restores; a hard kill of the process (a tool timeout on Windows) restores nothing, which is why the snapshot directory is printed before the first revert.

`--base` is where the pre-fix content comes from and defaults to `HEAD`. That is right only before you commit. After the commit, `HEAD` is your fix, and a baseline taken from it silently contains the very change it is supposed to lack; the run then "reproduces nothing", which reads as "the bug was never real", and `redgreen` reports the file as identical to the base and the test as pinning nothing. Once you have committed, pass `--base origin/main`. A base that does not resolve (a typo, or a remote branch never fetched in this worktree) is refused before any file is touched, as is a run from anywhere but the repository root.

Where a whole-file revert would break the test's imports (the fix adds an export the test uses), simulate the old behaviour in place instead: disable the one branch that matters, or restore the old function body under the new name, run the test by hand for the red, then put the fix back. Keep a positive control in the file, an assertion that passes both before and after, so a red run proves the defect, not a broken harness. `redgreen` sends you here itself when the red run fails on an import.

Record both outcomes for the PR body.

---

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

Then run the standalone checks under `.claude/`, from the repo root: `git ls-files` pathspecs are relative to the current directory, and from anywhere else the loops below run nothing and exit 0. Only the two under `.claude/hooks/` have a CI job (`.github/workflows/hook-tests.yml`, on a pull request that touches `.claude/hooks/**` or `.claude/settings.json`); the ones under `.claude/skills/` run only because someone remembers to, and each pins a footgun that has already cost a session. There are two kinds, shell checks over hooks and skill prose, and `.mjs` checks over the hook and the pure functions in `driver.mjs`, one loop each:

```bash
for t in $(git ls-files '.claude/**/*.test.sh'); do echo "--- $t"; bash "$t" || echo "FAILED: $t"; done
for t in $(git ls-files '.claude/**/*.test.mjs'); do echo "--- $t"; node "$t" || echo "FAILED: $t"; done
```

`git ls-files` rather than a shell glob or `find`, because both of those go wrong here in ways that look like a pass:

- A `**` glob half-runs. Bash expands `**` across directories only with `shopt -s globstar` set, and it is not set here, so `**` collapses to a single-level `*`: each pattern matches only the one check a single level down under `.claude/hooks/` and silently skips every check under `.claude/skills/`, two levels down. The check it finds passes, so the loop reports a clean run having skipped most of the checks; nothing fails and there is nothing to notice.
- `find .claude` over-matches in the main checkout. `.gitignore` puts `.claude/worktrees/` there, holding whole checkouts with their own `node_modules`, so `find` returns many more files than the checks, most of them third-party tests it would then try to execute. A fresh worktree has no such directory, so `find` looks correct there and only misbehaves where the skill is normally run.

`git ls-files` sidesteps both: the checks are tracked, and everything `find` picks up by mistake is ignored or untracked. Count the `---` lines against what `git ls-files '.claude/**/*.test.*'` returns: the loops print one per check they run, ten: two under `.claude/hooks/` (one shell, one Node), six Node checks under `.claude/skills/drive-web-editor/`, and one shell check each under `.claude/skills/resolve-issue/` and `.claude/skills/review-pr/`. Stage a new check before running the loop, because `git ls-files` sees only what is tracked.

The checks need no `node_modules`: the driver imports `playwright` only inside the commands that launch a browser, so a worktree that skipped `npm install` still runs all ten.

The two loops take about two minutes here (1m37s at `bfb1d836c`, most of it Node startup for the `.mjs` checks) and longer on a loaded machine, because they spawn many small processes; give them a ten-minute timeout and read the result rather than concluding a hang.

---

## Running vitest safely

This monorepo has OOM'd and hard-crashed this machine, so every run is capped, and the machine's capacity is shared with the other sessions running in their own worktrees. The resource rule: a single test file with one fork and a 1 GB heap fits alongside other sessions' runs, and the pull request says the run was made that way; a whole package needs the machine to itself, so before starting one check for other runs and wait for them to exit. Never run anything uncapped. To see what is in flight, run this via the PowerShell tool (in bash, `$_` gets eaten by the shell):

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*vitest*' } | Select-Object ProcessId
```

Single file:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=1024" npx vitest run src/tests/compiler/constDeclarationValidity.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1
```

```
 ✓ src/tests/compiler/constDeclarationValidity.test.ts (8 tests) 885ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

A directory, with a slightly larger cap:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/tests/compiler --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

`packages/sparkdown`'s full suite is ~156 files / ~1800 tests / ~28 min and is at the edge of this machine even at `--max-old-space-size=4096`. Never run it in one go; run it in halves, sequentially, waiting for each to fully exit:

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run src/tests/compiler src/tests/runtime --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

```bash
cd packages/sparkdown && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run src/tests/luau-conformance --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2
```

Exit code 0 does not mean green. Two OOM shapes both exit 0: `Error: Worker exited unexpectedly` with no pass count; or the log simply stops with no `Test Files` / `Tests` summary at all. Confirm the summary lines exist and the file count matches what you expected; a run can exit 0 having completed 13 of 156 files and look perfectly clean. To count:

```bash
grep -c "✓ src/" testrun.log
```

Report the real numbers in the PR body. If a pre-existing failure is unrelated to your change, say so explicitly rather than quietly ignoring it; confirm it also fails on `origin/main`.

Capture the failing-test names, not just the count. With a large pre-existing failure set (one session met 103) equal counts do not mean equal failures: a run that fixes one test and breaks another shows the same number. Save the `FAIL` lines from the baseline run and from your branch, strip the colour codes, and diff the two lists; that is what isolates the test your change actually affected:

```bash
grep -a "FAIL " base-run.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u > fail-base.txt
grep -a "FAIL " branch-run.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u > fail-branch.txt
diff fail-base.txt fail-branch.txt
```

---

## Troubleshooting

| Symptom                                                                                               | Cause → fix                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vitest exits 0 with no `Test Files` / `Tests` summary                                                 | An OOM'd worker was killed by the OS. Not a pass. Lower `maxForks`, split the suite.                                                                                                                                                                                                        |
| `minThreads and maxThreads must not conflict`                                                         | You passed `maxForks` without `minForks`. Always pass both.                                                                                                                                                                                                                                 |
| `redgreen` says a file `changed while it was reverted`                                                | Something wrote to the file while it held the base content: a review-round edit landing, an editor, a formatter, a watcher. The file now holds the base content plus that edit, not the fix; the fix is at the `snapshotPath` in the report. Merge by hand, then run again. Never copy the snapshot over the file blind. |
| `redgreen` says the file is `identical to HEAD` and the test `pins nothing`                           | The fix is already committed, so `HEAD` contains it. Pass `--base origin/main`.                                                                                                                                                                                                             |
| `redgreen` refuses: `--base "…" does not resolve to a commit`                                         | A typo, or a remote branch this worktree has never fetched. `git fetch origin main` and spell it `origin/main`. Nothing was touched.                                                                                                                                                       |
| `redgreen` refuses: `run from the repository root`, or `run it from this driver's own worktree root` | Started from a package directory, or from another checkout's root. `--files` and the test command resolve from where you stand, so `cd` to the worktree that holds the driver; the `--test` command can still `cd` into the package itself.                                                 |
| `redgreen` red `reason` is `unknown`, `ok: false`, output present                                     | The failure output did not look like an assertion to the command. Read `red.tail`: the ticket's assertion in an unfamiliar form is fine to cite (say so in the PR); anything else is not a red.                                                                                             |
| `git show origin/main:some/path` → `fatal: ambiguous argument 'origin\main;some\path'`                | Git Bash rewrote the `rev:path` argument as a Windows path. Prefix the command with `MSYS_NO_PATHCONV=1`, and quote the argument.                                                                                                                                                            |
| A "pre-fix" copy pulled from `HEAD:` still contains the fix                                           | Once you have committed, `HEAD` is your fix. Extract the baseline from `origin/main:` instead. The failure is silent: the run looks like a baseline and reproduces nothing, which reads as "the bug is not real".                                                                            |

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something Troubleshooting does not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as `CLAUDE.md` describes. Prefer a mechanism to a warning: when the problem is a step a session can forget or get wrong, propose the driver command or the check that makes the mistake impossible rather than a sentence telling the next session to be careful; `redgreen` is the shape to copy. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.

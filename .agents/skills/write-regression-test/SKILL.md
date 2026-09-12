---
name: write-regression-test
description: Write the test that pins a fix or a feature, prove it is honest with the redgreen cycle (fails on the pre-fix source, passes on the fix), run the affected suites and the typecheck under the machine's memory caps, and run the standalone checks under .claude/. Invoked by resolve-issue at its test step and by file-bug for a repro test, and usable directly whenever a change to a package needs a test and a safe run.
---

# Write a regression test

Read [runner notes](../RUNNERS.md) and the repository's agent instructions before proceeding. Load a named skill's full SKILL.md when the runner has no skill invocation capability.

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

Never use the shared Git stash: its stack belongs to the repository, not to this worktree. Use `redgreen` below for verified snapshots and restoration, regardless of hook availability.

Run the whole cycle through the driver, from the repo root, naming the test invocation (under the caps in Running vitest safely) and every changed source file the test exercises:

```bash
node .agents/skills/drive-web-editor/driver.mjs redgreen --test "cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/tests/compiler/FilterImageLayers.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1" --files packages/sparkdown/src/compiler/utils/filterImage.ts
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
  "red": { "exit": 1, "outcome": "failed", "reason": "assertion", "tail": ["…"], "summary": "Test Files  1 failed (1) / Tests  2 failed | 3 passed (5)" },
  "green": { "exit": 0, "outcome": "passed", "tail": ["…"], "summary": "Test Files  1 passed (1) / Tests  5 passed (5)" },
  "problems": []
}
```

`ok: true` means exactly this: every named file differs from the base, the test exited non-zero on the base with output that reads as a test failure, every file came back byte-for-byte, the test exited zero on the fix, and, on a run that names vitest or whose output carries vitest's own run banner, a `Test Files`/`Tests` summary could be parsed from the red output and it reports tests having run: a summary that reads `Tests  no tests` is a problem rather than a proof, because every test file failed to collect and nothing was asserted. It is an exit-code proof. Read `red.failures` to identify the ticket's failing case: an unrelated failure looks identical to the command. This excerpt keeps the first 40 recognized failure lines, strips color codes, caps each line at 2000 characters, and reports additional matches in `failuresOmitted`. `red.tail` keeps the last 40 nonempty lines, which passing output can displace. Each half saves its captured output at `logPath` in the snapshot directory; read that log for unmatched formats, truncated excerpts and assertion context. Output terminated at the 64 MiB capture limit remains partial and proves nothing. Quote the actual assertion and the red/green summaries in the PR body. `ok: false` exits non-zero, and `problems` is never empty when it does:

- The test passed against the base: it pins nothing. Either it does not assert the ticket's behaviour, or `--files` does not name where the fix lives.
- A file is identical to the base. Nothing to revert in it: either the fix is committed (pass `--base origin/main`) or the file is not where the fix lives.
- The red run died on an import or syntax error (`red.reason`) rather than the defect. A whole-file revert broke the test's imports; use the in-place path below.
- The runner found no test: `--files` named the test file itself, so the revert removed it. List only the changed sources.
- The test command could not run (`reason: "shell"`): the shell reported a missing command or script. Fix `--test`.
- The red run's output is unrecognized, mixes assertion and shell diagnostics, or has assertion output with a reserved shell status (`reason: "unknown"`, or no output at all). A test printing its child's shell error and a broken command chain can produce identical output and status, so neither is automatically accepted as proof. Read the full run yourself and explain the ticket's actual failing assertion in the PR; a broken invocation, config error, worker crash or truncated run proves nothing. For the default POSIX shell or an explicitly named sh/bash/dash executable, status 126/127 with no assertion evidence is treated as an execution failure independently of locale; with assertions it is ambiguous, since programs can choose those statuses too. This convention is not applied to cmd, so a failure-count status accepted under cmd can require adjudication under Git Bash or Linux. Other custom interpreters, including zsh/ksh/ash or a custom Windows ComSpec, are unverified. Caller environment values are preserved; fixtures pin their own Windows ComSpec to actual cmd. Other shell wording is recognized in English; unrecognized localized output still requires inspection. The report preserves `launchError`, `signal` and `posixShell` to explain these decisions.
- The command names vitest, or its output shows vitest's own run banner, and the red run failed with what reads as a real assertion but no `Test Files`/`Tests` summary line could be parsed from it. That is either a reporter or a version this parser does not know, or a command that names vitest in a path or a comment without running it; read `red.tail` for the failure and quote it directly in the PR.
- The red run's summary says no test ran (`Tests  no tests`). Every test file failed to collect, so nothing was asserted and the red proves nothing about the defect; usually the revert broke an import the test file needs, which the in-place path below is for.
- The runner crashed on the base (`reason: "crash"`: a killed worker, an out-of-memory, a fatal error). Proves nothing; lower the caps or split the run. An `ENOBUFS` execution error means the 64 MiB output cap terminated the run; reduce output or split the run. Its partial output is not regression evidence.
- A file could not be reverted (read-only, locked). The red run is not attempted; files already reverted come back, the rest were never touched.
- A file changed while it was reverted. A review round, an editor, or a watcher wrote to it. The command does not restore that file, because overwriting it would replace the newer edit with the snapshot, which is exactly the stale-copy failure this command exists to prevent. The file then holds the base content plus that edit, not the fix; the fix is at the `snapshotPath` the report names. Merge the two by hand and run again.
- A restored file does not match its snapshot, or could not be checked (`restoreError` says why, e.g. a read-only file, or a path that became a directory). The fix is at `snapshotPath`; put it back by hand. The other files still come back on their own.
- The test failed against the fix. The restore is verified by hash, so this is the fix itself: the test does not pass on your change.

The snapshot and the restore happen inside one process, so there is no copy to go stale between review rounds; run the command again after each round rather than reusing anything from the last one. Once the snapshot is taken the command does not throw: the restore runs in a `finally`, every later error becomes a `problems` entry, and the report always prints. A Ctrl+C delivered directly to the test child can return through that `finally`, but a tool-driven interruption on Windows can terminate the driver without restoring files. A hard kill or tool timeout can do the same. After any interruption, verify the final report and each restoration hash; if no report was produced, inspect the source against the printed snapshot before resuming work. The snapshot directory is printed before the first revert for this recovery.

`--base` is where the pre-fix content comes from and defaults to `HEAD`. That is right only before you commit. After the commit, `HEAD` is your fix, and a baseline taken from it silently contains the very change it is supposed to lack; the run then "reproduces nothing", which reads as "the bug was never real", and `redgreen` reports the file as identical to the base and the test as pinning nothing. Once you have committed, pass `--base origin/main`. A base that does not resolve (a typo, or a remote branch never fetched in this worktree) is refused before any file is touched, as is a run from anywhere but the repository root.

Where a whole-file revert would break the test's imports (the fix adds an export the test uses), simulate the old behaviour in place instead: keep an aside copy of the file before you touch it, disable the one branch that matters, or restore the old function body under the new name, run the test by hand for the red, then put the fix back. Keep a positive control in the file, an assertion that passes both before and after, so a red run proves the defect, not a broken harness. `redgreen` sends you here itself when the red run fails on an import. After restoring a file from its copy, read it again before editing it; the editor tool refuses a file it has not read since the restore.

Keep each half of that cycle under the command tool's own timeout: the swap, the red run and the restore in one script, the green run in another. The source is then disabled only inside one invocation, so a script that finishes at all puts it back and only a hard kill mid-script can leave it disabled. This in-place path runs no `redgreen` command, so its recovery is the aside copy you kept: compare that copy against the working file byte for byte to tell whether the restore already happened, and copy it back by hand if it did not.

A test added for a line the base commit already has cannot go red by swapping sources, since the base already contains that line; check it by mutation instead: weaken that line alone with a script that patches and restores the file, byte-compared, run the one test, and report it as checked by mutation.

Record both outcomes for the PR body.

`failureLinesTruncated` counts excerpt lines clipped to the character limit. Recognized failure labels are evidence to inspect, not an exhaustive test inventory; the saved raw logs retain the details that the excerpt omits.

To exercise the cycle in a throwaway repository, import `runRedGreen` directly and pass the scratch repository's root. The driver CLI deliberately accepts only its own worktree. Author a private `.mjs` file with the editor capability, using `pathToFileURL` for the module's absolute native path on Windows and POSIX:

```javascript
import { pathToFileURL } from "node:url";
const { runRedGreen } = await import(pathToFileURL(process.argv[2]).href);
const report = runRedGreen({ repoRoot: process.argv[3], test: "node check.mjs", files: ["lib.mjs"], log: console.log });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
```

Invoke that file with the absolute `.agents/skills/drive-web-editor/redgreen.mjs` path and the scratch repository path as separate quoted arguments. Initialize and commit the scratch baseline, then apply its fix before invoking it; print the scratch repository path in the same command as any destructive experiment. A bare Windows drive path is not an ESM URL. Keep the report, snapshot and logs outside the worktree.

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

Then run the standalone checks from the repository root:

```bash
node scripts/check-agent-tooling.mjs
```

The runner discovers tracked checks under the shared skills, harness hooks, `scripts/` and `.github/scripts/` with Git, prints the derived count and a start and completion result per file, rejects empty discovery and unsupported executable test extensions, and exits nonzero on any failure. Stage new checks before running it. The CI workflow runs this same command on Windows and Linux; it also checks the sparse checkout and installation. No dependency install is needed for bare Node checks. A skipped case is listed and is not evidence for that capability. Confirm every added check is discovered and that its inputs are present in the workflow's sparse checkout and path triggers.

Run with the machine otherwise idle. The runner probes Bash before launching checks and prepends its directory to the inherited PATH so nested Node processes can find it. It chooses Git for Windows Bash on Windows; `AGENT_TOOLING_BASH` can select an explicit executable. A missing required interpreter fails the run. Each check has a five-minute bound, configurable with `AGENT_TOOLING_TIMEOUT_MS` from 100 to 3600000 milliseconds, and prints progress every 30 seconds while awaiting exit. A timeout stops the launched process tree and counts as failure; unconfirmed cleanup aborts subsequent checks and reports them as not run. A start or progress line alone proves no completion. Keep logs until the closing counts, failures and every completion result have been read.

The runner's EXPECTED_CHECKS value pins the derived tracked runnable count in both directions, excluding the grammar scanner check that runs in the typecheck workflow. Update it when adding or removing a check, and review any lost coverage. The CI summary lists every skipped case. Portable extension fixtures, real shell classification, directory-link access and launcher-tree shutdown run on both Windows and Linux. POSIX execute-permission and Linux group-ownership probes report their platform skips on Windows. Windows-only held-tree and long-path cases run in the Windows matrix leg; zip fixtures need the workspace dependency install. Directory-link fixtures can also report an environment capability skip with the filesystem error; retain that explanation and do not count the skipped fixture as verified.

If the launched parent has already exited while descendants retain its pipes, the runner cannot safely identify that tree through the parent's process identifier. It refuses the kill, aborts the remaining checks and lists each as not run. Inspect the recorded timeout and processes before retrying; an unconfirmed tree shutdown is not successful cleanup.

Every timeout aborts the aggregate after attempting to stop the active Windows tree or POSIX process group. A detached descendant can escape a POSIX group, and the parent's exit alone cannot prove every descendant stopped. Inspect processes before retrying; the remaining not-run results are incomplete coverage, never passes.

---

## Running vitest safely

This monorepo has OOM'd and hard-crashed this machine, so every run is capped, and the machine's capacity is shared with the other sessions running in their own worktrees. The resource rule: at most one vitest run at a time, a 1 GB heap and one fork. Check for existing runs and wait for exit before starting any run. Never run uncapped. On Windows, inspect processes through PowerShell:

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

For a directory or package, enumerate its tracked test files and run them one file at a time using the single-file command above. Keep the 1024 MB heap and one fork for every run. Wait for each process to exit and verify its test-file and test summaries before starting the next. Do not report the directory or package complete until every enumerated file has a verified result. This strategy bounds each invocation to the same scope as the single-file command; no larger-suite timing or memory claim is inferred from it. Enumerate tracked paths with Git, then apply the package's configured test include and exclude patterns using their glob semantics. Sparkdown currently includes test and spec files with ts and tsx extensions anywhere under src, excluding node_modules, dist and out; a manifest restricted to src/tests or test.ts is incomplete. Do not pass Vitest's brace patterns directly to Git, whose pathspec engine does not implement those brace alternatives. Keep that manifest and a separate log/result for every file. Concatenate those verified per-file logs into `testrun.log` for the aggregate count below. Likewise, `base-run.log` and `branch-run.log` below mean concatenations for the same manifest, not single multi-file invocations.

Exit code 0 does not mean green. Two OOM shapes can exit 0: `Error: Worker exited unexpectedly` with no pass count, or a log that stops with no `Test Files` / `Tests` summary. Verify both summary lines and one completed test file in every individual invocation. Then compare the completed-file inventory across the concatenated logs with the original manifest; a partially completed sequence must not be reported as a complete package. For Sparkdown's log paths, the aggregate count is:

```bash
sed 's/\x1b\[[0-9;]*m//g' testrun.log | grep -aoE "src/tests/[A-Za-z0-9/._-]+\.test\.ts \(" | sort -u | wc -l
```

Count by the path, not by the tick. Matching the `✓` glyph returns 0 in Git Bash here whatever the log holds, because the log is UTF-8 and the shell's locale is not; the run then reads as "completed no files at all", which is the same shape as the OOM this count exists to catch. Counting distinct file paths also survives a file reported more than once.

Report the real numbers in the PR body. If a pre-existing failure is unrelated to your change, say so explicitly rather than quietly ignoring it; confirm it also fails on `origin/main`.

Capture the failing-test names, not just the count. With a large pre-existing failure set (one session met 103) equal counts do not mean equal failures: a run that fixes one test and breaks another shows the same number. From the concatenated logs for the same file manifest, save the `FAIL` lines from the baseline run and from your branch, strip the colour codes, and diff the two lists; that is what isolates the test your change actually affected:

```bash
grep -a "FAIL " base-run.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u > fail-base.txt
grep -a "FAIL " branch-run.log | sed 's/\x1b\[[0-9;]*m//g' | sort -u > fail-branch.txt
diff fail-base.txt fail-branch.txt
```

---

## Troubleshooting

Every `redgreen` failure names its own fix in the `problems` entry it reports, so what is left here is the two failures no command in this repository produces:

| Symptom                                                                                | Cause → fix                                                                                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `minThreads and maxThreads must not conflict`                                          | vitest's own error: you passed `maxForks` without `minForks`. Always pass both.                                                    |
| `git show origin/main:some/path` → `fatal: ambiguous argument 'origin\main;some\path'` | Git Bash rewrote the `rev:path` argument as a Windows path. Prefix the command with `MSYS_NO_PATHCONV=1`, and quote the argument. `redgreen` sidesteps this by spawning git without a shell; it bites a `git show` you run yourself. |

---

## Improving this skill

If a step here failed, needed a flag or path it does not give, did not apply to your change without saying so, or cost you time on something Troubleshooting does not cover, report it under a "Skill feedback" heading in your final message with the edit you propose, as the repository's agent instructions describe. Prefer a mechanism to a warning: when the problem is a step a session can forget or get wrong, propose the driver command or the check that makes the mistake impossible rather than a sentence telling the next session to be careful; `redgreen` is the shape to copy. When you are certain of the fix and the session has a branch and pull request, make it in this file in its own commit and mention it under the pull request's Notes for reviewers.

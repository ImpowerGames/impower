# Run Vitest safely

All commands run from the worktree root unless stated otherwise.

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

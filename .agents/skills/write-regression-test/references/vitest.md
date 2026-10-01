# Run Vitest safely

Commands run from the worktree root unless stated otherwise.

## Package verification

The Test Suite workflow is the package gate for a pull request, and the only source of a package result. Whole package suites are never run locally: push and read the workflow's run on the pushed head. A base-branch baseline also comes from that workflow, from its runs on the base branch (`gh run list --workflow test-suite.yml --branch main`), not from a local run on a base commit. The runner's `start` command, which runs a whole package, is refused by the repository hook with no override.

An existing run directory, such as one left by an earlier session, can still be read and continued:

```text
node scripts/test-suite.mjs status <run-directory>
node scripts/test-suite.mjs resume <run-directory>
node scripts/test-suite.mjs resume <run-directory> --retry src/tests/example.test.ts
```

A suite run asks the installed Vitest to discover configured includes/excludes using Vitest's own glob semantics, intersects those paths with Git's tracked inventory, rejects an empty manifest, and executes each file separately. Stage new tests first. Supported inputs are single Node test packages containing test/spec TS and TSX files, including files outside `src/tests`. Workspace, browser, typecheck and per-file pool-routing configurations are refused; use the individual package configuration. Configured test semantics remain in force.

Every child runs with a heap capped at 1024 MB, one fork and no file parallelism. A machine-wide reservation coordinates participating worktrees; the runner also checks for other Vitest/tinypool processes before launching. `run` below takes the same reservation. Process-table access failures and ambiguous reservations block execution. Recovery never kills processes.

Keep the complete command-tool result, including session ID and exit status. If the tool yields a session ID, poll that same session until its exit is confirmed; do not forward only its output text. A yield or missing output is neither a timeout nor a pass. Use `status` from another command to read durable progress. Identity checks can take time on a large installation; execution prints progress while scanning.

Each run lives under the worktree's Git directory, outside source discovery. `run.json` saves the manifest and attempts. Each attempt has an independent UTF-8 `output.log`, `vitest.json` and atomically updated `attempt.json`, with PID, OS start identity, actual exit status and signal when observed. Test caches also live there. `summary.json` compares the latest attempts with every manifest file and retains exact failed-test names/messages, skipped/todo names and incomplete files. Prior attempts remain available, including after an explicit failed-file retry. Do not concatenate logs through shell encoding conversions.

Only complete, matching text and structured results with a successful observed child exit can pass. Missing summaries, worker crashes, zero executed tests, malformed/partial reports, failed assertions and missing files fail verification even when an exit code is zero. A suite with unfinished files is incomplete. Read the summary and the relevant attempt logs before reporting counts.

`resume` keeps verified completed results, retries unfinished attempts after process reconciliation, and retries failed files only when explicitly listed after `--retry`. An alive coordinator or child prevents duplicate execution. An absent child whose coordinator never observed exit is interrupted, not passed, even if it left a JSON report. Unknown ownership blocks recovery. Inspect the named reservation and journal; preserve ambiguous records for manual investigation rather than deleting locks or signalling unrelated processes. The shared reservation is under `%ProgramData%/Impower/test-suite` on Windows and `/var/tmp/impower-test-suite` on Linux; both platforms are supported. A transaction interrupted while creating/recovering ownership leaves a guard that also requires inspection.

Reusable evidence is tied to tracked and untracked working-tree file contents, including ignored assets and configuration, Git tracked-file membership, the saved manifest, the forwarded child environment, Node version/platform, and installed dependency metadata (paths, link targets, sizes, modification/change times, modes and file identities). Ignored files are included because tests or configuration can read them; edits to generated code, local configuration or output artifacts can conservatively invalidate a run too. Environment values enter only the digest and are never saved in logs or journals; changing the environment requires a fresh run rather than mixing results from different configurations. This supports dirty worktrees and conservatively invalidates the whole run when inputs change. Source hashes are cached only within a coordinator by filesystem change metadata. Dependency metadata avoids re-reading large installed binaries on every status check, including installations beside ignored package manifests. Git state directories, generated caches and Vite's timestamped config bundles are excluded. A changed identity makes the run stale and `resume` refuses it; old evidence is retained. Avoid modifying inputs during verification. Results do not attest to externally changed services or dependencies whose content and all filesystem identity metadata have been deliberately restored.

For baseline comparison, compare the Test Suite workflow's package results on the base branch and on the pushed head: confirm the same test files ran and compare exact failure inventories. Equal failure totals are insufficient. Include actual file/test totals, failure names, skips and incomplete jobs in the PR.

## Single-file and reproduction runs

A sandboxed reviewer whose process census or reservation write is denied can request caller-approved test files through the launcher's [delegated execution service](../../review-pr/HANDOFF.md#delegated-tests-and-benchmarks). The coordinator runs this same `run` command outside the reviewer sandbox, retaining the census, reservation and caps. Inspect its returned output and exit result. Merely reading an absent reservation file is not admission; direct unlocked execution remains unsupported.

Run the test files under work with `run`, naming one or more; it refuses a call with none and a call naming more than eight, with no override, and the package result comes from the Test Suite workflow above. "Under work" means the test file you added or changed and the one or two existing files that exercise the same code; a longer list of existing files is a package run spelled out, and enumerating them does not make it local work. Test paths are relative to the package directory:

```bash
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/constDeclarationValidity.test.ts --wait 600
```

`run` takes the machine-wide reservation, waits for other Vitest processes to exit while holding it, then runs the package's installed Vitest in the foreground with a 1024 MB heap and `--pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1 --no-file-parallelism`: one worker process with a fresh environment per file, the arrangement the Test Suite workflow uses. `singleFork=true` shares one environment across a package's files and fails jsdom suites such as `packages/spark-web-player` for reasons unrelated to the change under test. The package's own configuration stays in force. Its exit status is Vitest's, and the redgreen driver accepts it as a `--test` command. Require both `Test Files` and `Tests` summaries and inspect the actual assertion. The redgreen diagnostic classifier's separate no-test issue is tracked by #539; this runner does not repair or substitute for that classifier.

`--wait <seconds>` also applies to `resume`. Without it, a live reservation or another Vitest process refuses at once. With it, a live reservation, a present Vitest process or a reservation guard held by another session's transaction waits up to that bound, and `resume` waits again before each file; progress prints as `waiting` lines. An ambiguous or unknown reservation still refuses at once. A timeout releases the reservation and names the processes still present. When the reservation cannot be taken, no test has run: the command prints `test-suite: not run: <reason>` and exits 75, and the same command can be run again. Because single-file runs and suites share one reservation, they queue behind each other; a direct `npx vitest` call bypasses it and can make another session's run wait or refuse.

A repository hook (`.agents/hooks/local-test-hook.mjs`) refuses a direct Vitest call with no file argument, a directory, a glob, a name that is not an existing test file, or more than eight files, and a package `npm test`, `npm run test`, `pnpm test` or `yarn test` whose script may run Vitest, and `node scripts/test-suite.mjs start` with no override; it allows the runner's `run` up to the same eight files, `status` and `resume`. The runner enforces the same bound itself, so a wrapper script or a `--test` string the hook cannot read is refused all the same. It reads command text statically, so a command built from a variable or an alias, or handed to another program as a string, is outside its coverage and this section is the rule.

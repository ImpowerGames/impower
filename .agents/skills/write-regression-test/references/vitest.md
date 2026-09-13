# Run Vitest safely

Commands run from the worktree root unless stated otherwise.

## Package verification

Use the repository-owned runner:

```text
node scripts/test-suite.mjs start packages/sparkdown
node scripts/test-suite.mjs status <printed-run-directory>
node scripts/test-suite.mjs resume <printed-run-directory>
node scripts/test-suite.mjs resume <printed-run-directory> --retry src/tests/example.test.ts
```

`start` prints its run directory and coordinator identity before discovery. It asks the installed Vitest to discover configured includes/excludes using Vitest's own glob semantics, intersects those paths with Git's tracked inventory, rejects an empty manifest, and executes each file separately. Stage new tests first. Supported inputs are single Node test packages containing test/spec TS and TSX files, including files outside `src/tests`. Workspace, browser, typecheck and per-file pool-routing configurations are refused; use the individual package configuration. Configured test semantics remain in force.

Every child runs with a heap capped at 1024 MB, one fork and no file parallelism. A machine-wide reservation coordinates participating worktrees; the runner also checks for other Vitest/tinypool processes before launching. Direct invocations do not acquire that reservation and must never be launched alongside a suite. Process-table access failures and ambiguous reservations block execution. Recovery never kills processes.

Keep the complete command-tool result, including session ID and exit status. If the tool yields a session ID, poll that same session until its exit is confirmed; do not forward only its output text. A yield or missing output is neither a timeout nor a pass. Use `status` from another command to read durable progress. Identity checks can take time on a large installation; execution prints progress while scanning.

Each run lives under the worktree's Git directory, outside source discovery. `run.json` saves the manifest and attempts. Each attempt has an independent UTF-8 `output.log`, `vitest.json` and atomically updated `attempt.json`, with PID, OS start identity, actual exit status and signal when observed. Test caches also live there. `summary.json` compares the latest attempts with every manifest file and retains exact failed-test names/messages, skipped/todo names and incomplete files. Prior attempts remain available, including after an explicit failed-file retry. Do not concatenate logs through shell encoding conversions.

Only complete, matching text and structured results with a successful observed child exit can pass. Missing summaries, worker crashes, zero executed tests, malformed/partial reports, failed assertions and missing files fail verification even when an exit code is zero. A suite with unfinished files is incomplete. Read the summary and the relevant attempt logs before reporting counts.

`resume` keeps verified completed results, retries unfinished attempts after process reconciliation, and retries failed files only when explicitly listed after `--retry`. An alive coordinator or child prevents duplicate execution. An absent child whose coordinator never observed exit is interrupted, not passed, even if it left a JSON report. Unknown ownership blocks recovery. Inspect the named reservation and journal; preserve ambiguous records for manual investigation rather than deleting locks or signalling unrelated processes. The shared reservation is under `%ProgramData%/Impower/test-suite` on Windows and `/var/tmp/impower-test-suite` on Linux; both platforms are supported. A transaction interrupted while creating/recovering ownership leaves a guard that also requires inspection.

Reusable evidence is tied to all tracked and nonignored untracked source bytes, ignored JS/TS and JSON/YAML/environment configuration inputs, Git tracked-file membership, the saved manifest, the forwarded child environment, Node version/platform, and installed dependency metadata (paths, link targets, sizes, modification/change times, modes and file identities). Ignored code is included because configuration can import it; edits to generated code or local configuration can conservatively invalidate a run too. Environment values enter only the digest and are never saved in logs or journals; changing the environment requires a fresh run rather than mixing results from different configurations. This supports dirty worktrees and conservatively invalidates the whole run when inputs change. Source hashes are cached only within a coordinator by filesystem change metadata. Dependency metadata avoids re-reading large installed binaries on every status check. Generated caches and Vite's timestamped config bundles are excluded. A changed identity requires `start` to create a fresh run; old evidence is retained. Avoid modifying inputs during verification. Results do not attest to externally changed services or dependencies whose content and all filesystem identity metadata have been deliberately restored.

For baseline comparison, start separate runs on the base and fix, confirm identical file manifests, and compare exact failure inventories. Equal failure totals are insufficient. Include actual file/test totals, failure names, skips and incomplete attempts in the PR.

## Single-file red/green reproduction

The snapshot/restoration driver still accepts a direct single-file command. Check existing Vitest processes and the suite reservation first, then keep the heap and fork caps:

```bash
cd packages/sparkdown && NODE_OPTIONS=--max-old-space-size=1024 npx vitest run src/tests/compiler/constDeclarationValidity.test.ts --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=1
```

On Windows, inspect Node command lines with `Get-CimInstance Win32_Process` and the reservation JSON above. Wait for active runs to exit. Require both `Test Files` and `Tests` summaries and inspect the actual assertion. The redgreen diagnostic classifier's separate no-test issue is tracked by #539; this runner does not repair or substitute for that classifier.

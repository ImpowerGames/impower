# Vendored Luau upstream conformance tests

This directory is a verbatim copy of `tests/conformance/` from
[luau-lang/luau](https://github.com/luau-lang/luau), preserved here so
sparkdown can run Luau's own test suite against our Luau-superset
implementation.

Luau is MIT-licensed (see `LICENSE.txt`); we redistribute the parts
we run against per the license terms.

## What's committed

- `LICENSE.txt` — Luau's MIT license, preserved for attribution.
- `VENDORING.md` — this file.
- `conformance/` — every upstream `.luau` test fixture, verbatim.

## Why everything is committed

Sparkdown's upstream-conformance runner (`UpstreamConformance.test.ts`)
reads from `conformance/` verbatim at every test run, so the files
are load-bearing — not just reference material. Committing them
gives us:

- **Deterministic CI.** A fresh checkout has the same fixtures as
  any developer machine. The baseline runs everywhere.
- **Reviewable upgrades.** Re-vendoring becomes a single commit
  (`feat: bump luau conformance suite to <commit>`) that the team
  can diff and accept consciously, rather than an environment
  quirk silently introducing new tests.
- **Pinned semantics.** When Luau changes behavior, we want to
  bump intentionally, not discover the divergence by accident.

The runner skips files known to require infrastructure sparkdown
doesn't have yet (coroutines, metatables, buffers, vectors, native
codegen). See `SKIP_FILES` in `UpstreamConformance.test.ts`.

## How to re-vendor

When you want a fresh snapshot of upstream Luau's conformance suite,
run the commands below. Then `git add` the result and commit —
the baseline test will pick up any new fixtures automatically.

```bash
TARGET=packages/sparkdown/src/tests/luau-conformance/upstream
rm -rf "$TARGET/conformance"
git clone --depth 1 https://github.com/luau-lang/luau.git /tmp/luau-upstream
mkdir -p "$TARGET/conformance"
cp -r /tmp/luau-upstream/tests/conformance/. "$TARGET/conformance/"
cp /tmp/luau-upstream/LICENSE.txt "$TARGET/LICENSE.txt"
rm -rf /tmp/luau-upstream
```

## Snapshot

- Upstream commit at vendor time: `c8cf2864adec33eb4eb5b4cc7e0708aa74893ba0`
  (2026-05-15, "Sync to upstream/release/721 (#2394)").

Update this entry whenever you re-vendor.

## Type-checker test cases

`typecheck-cases.json` lists every test case in Luau's 31 type-checker test files (`tests/TypeInfer.test.cpp`, `tests/TypeInfer.*.test.cpp`, `tests/NonStrictTypeChecker.test.cpp` and `tests/NonstrictMode.test.cpp`) at one commit, with Luau's error kinds at that commit. The port of those tests in `../typecheck/` is checked against it, as `../typecheck/README.md` describes. The list is generated rather than copied; the snippets the port carries are Luau's, under its MIT license (`LICENSE.txt`).

Pinned commit: `7d5f73364fdbbaa984fa545071630eba73cfea98` (2026-09-15, "improve stringification of metatable types (#2545)"). The same pin is recorded in the file.

To move the pin, fetch the test files and `Error.h` at the new commit, then regenerate the list with `packages/sparkdown/scripts/generateTypecheckCases.ts`. From the repository root:

```bash
PIN=<commit>
LUAU=/tmp/luau-typecheck
REPO=$(pwd)
git init "$LUAU" && cd "$LUAU"
git remote add origin https://github.com/luau-lang/luau.git
git sparse-checkout set --no-cone '/tests/*' '/Analysis/include/Luau/Error.h'
git fetch --depth 1 --filter=blob:none origin "$PIN"
git checkout FETCH_HEAD
cd "$REPO/packages/sparkdown" && node scripts/generateTypecheckCases.ts "$LUAU"
```

In Git Bash on Windows, prefix the `sparse-checkout` line with `MSYS_NO_PATHCONV=1`, or its patterns are rewritten as Windows paths. The script prints the number of cases and markers it found, any case name a file uses twice, and any test file that looks like a type-checker file but is not in its list. The coverage test in each ported file then names the cases that changed; port them, and update the pinned commit above.

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

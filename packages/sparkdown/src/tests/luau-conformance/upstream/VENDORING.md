# Vendored Luau upstream conformance tests

This directory is a verbatim copy of `tests/conformance/` from
[luau-lang/luau](https://github.com/luau-lang/luau), preserved here so
the team has the authoritative Luau behavioral reference
alongside sparkdown's Luau-subset implementation.

Luau is MIT-licensed (see `LICENSE.txt`); we redistribute the parts we
actively reference as porting source material and gitignore the rest.

## What's committed

- `LICENSE.txt` — Luau's MIT license, preserved for attribution.
- `VENDORING.md` — this file.

## What's gitignored

- `conformance/` — the upstream `.luau` test fixtures themselves.
  Sparkdown's luau-conformance harness ports these one by one into
  `../fixtures/<name>.sd` (verbatim copies with the `.sd` extension,
  per project convention — Sparkdown is a superset of Luau). The
  upstream copies aren't needed in version control; clone them down
  when needed via the re-vendor command below.

## Why it's vendored

Sparkdown aspires to be a strict superset of Luau. We port Luau's
conformance suite verbatim (just renamed `.luau` → `.sd`) so that any
fixture that fails to compile or fails an `assert(...)` is a real
gap in our Luau coverage. Having the upstream tests checked out
locally lets us:

1. Diff our fixture against the upstream to confirm we ported it
   without rewriting.
2. Identify which portions of Luau remain unimplemented in sparkdown
   (failing assertions become the next backlog item).
3. Pull a fresh snapshot when Luau adds new conformance tests.

## How to re-vendor (when you want a fresh snapshot)

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

## Don't import from here at runtime

Sparkdown's tests under `../` use ported `.sd` fixtures from
`../fixtures/`, not these `.luau` files directly. This directory is
reference / source material for porting and gap analysis. The
conformance harness (`../conformanceTestHarness.ts`) does NOT read
from `upstream/`.

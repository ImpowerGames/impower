# Vendored inkjs upstream tests

This directory is a verbatim copy of `src/tests/` from
[y-lohse/inkjs](https://github.com/y-lohse/inkjs) at the time of
vendoring, preserved here so our team has the authoritative inkjs
behavioral reference checked in alongside the engine fork.

Inkjs is MIT-licensed (see `LICENSE.md`); we redistribute the parts we
actively reference and gitignore the parts we don't.

## What's committed

- `specs/` — the inkjs test specs (vitest format), grouped by feature
  (Booleans, CallStack, Choices, Conditions, etc.). These are the
  authoritative reference for what behaviors the upstream engine
  guarantees. Sparkdown ports them into `src/runtime-tests/` and
  adapts the fixtures from ink → sparkdown syntax.
- `LICENSE.md` — inkjs's MIT license, preserved for attribution.
- `VENDORING.md` — this file.

## What's gitignored

- `inkfiles/original` — original `.ink` source fixtures. Sparkdown's runtime
  tests use sparkdown-syntax (`.sd`) fixtures we author ourselves;
  the originals aren't needed in version control.
- `compile.js` — the inkjs runner. Sparkdown has its own test harness
  (`runtimeTestHarness.ts`); this script isn't invoked here.
- `README.MD` — the upstream tests README, kept on disk for re-vendoring
  but not committed (we have this VENDORING.md as our team's doc).

## Why it's vendored

Sparkdown's runtime is a fork of inkjs. We port inkjs tests one by one
into `packages/sparkdown/src/runtime-tests/` and adapt the fixtures
from ink → sparkdown syntax. Having the upstream tests checked out
locally makes it easy to:

1. Verify our port still exercises the same behavior the original test
   intended.
2. Find gap coverage — features the original engine guarantees but
   we haven't ported a test for yet.
3. Cross-check engine refactors against the broadest possible test
   surface.

## Layout

Lives under `packages/sparkdown/src/inkjs/tests/` — matching the
upstream layout where `tests/` is a sibling of `engine/` and
`compiler/` inside `src/`.

## How to re-vendor (when you want a fresh snapshot)

```bash
rm -rf packages/sparkdown/src/inkjs/tests
git clone --depth 1 https://github.com/y-lohse/inkjs.git /tmp/inkjs-upstream
mkdir -p packages/sparkdown/src/inkjs/tests
cp -r /tmp/inkjs-upstream/src/tests/. packages/sparkdown/src/inkjs/tests/
cp /tmp/inkjs-upstream/LICENSE.md packages/sparkdown/src/inkjs/tests/LICENSE.md
rm -rf /tmp/inkjs-upstream
```

## Don't import from here

Sparkdown's own tests live in `src/runtime-tests/`. Tests in this
vendored directory must NOT be run, imported, or referenced by the
sparkdown build — they target the upstream inkjs API which differs
from sparkdown's runtime in non-trivial ways (no `scene`/`branch`,
no Luau methods, different operator precedence, etc.).

Treat this directory as documentation, not code.

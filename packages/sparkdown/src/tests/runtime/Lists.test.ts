// Ported from inkjs `src/tests/specs/ink/Lists.spec.ts`.
//
// Ink's `LIST` type — first-class enum-like values with arithmetic,
// ranges, item-of-list testing, and the `LIST_*` builtin family
// (LIST_ALL, LIST_COUNT, LIST_MIN, LIST_MAX, LIST_VALUE, LIST_RANDOM,
// LIST_RANGE, LIST_INVERT, LIST_INTERSECT) — doesn't have a Luau
// equivalent. Sparkdown uses Luau tables instead (see docs/runtime/DIVERGENCES.md).
//
// The full inkjs Lists.spec.ts therefore stays closed-by-design here,
// since every test exercises the LIST type specifically. However, the
// *intent* of those tests (add/remove, contains, count, range, mixed
// items, etc.) is now covered for sparkdown tables in
// `Methods.test.ts`, which exercises the builtin method dispatch
// (`t:insert`, `t:remove`, `t:find`, `t:len`, `t:sub`, `t:union`,
// `t:intersection`, `t:difference`, ...). See `docs/runtime/METHODS.md` for the full
// method set and rationale.

import { describe, test } from "vitest";

describe.skip("Lists — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  // Ink's `LIST` type is replaced by Luau tables (docs/runtime/DIVERGENCES.md).
  // The behaviors the inkjs Lists.spec.ts covers
  // (add/remove/contains/count/range/min/max/random/mixed-items/save-load)
  // all have table equivalents covered in `Methods.test.ts`:
  //
  //   - `LIST x = (...)` + `x += y` (add)        → `store t = {...}` + `t:insert(y)`
  //   - `LIST x -= y` (remove)                   → `t:remove(i)` (by index)
  //   - `LIST_COUNT(x)`                          → `t:len()` / `#t`
  //   - `LIST_RANGE(x, from, to)`                → `t:sub(from, to)`
  //   - `LIST_MIN(x)` / `LIST_MAX(x)`            → `t:min()` / `t:max()`
  //   - `LIST_RANDOM(x)`                         → `t:random()`
  //   - `x ? y` (contains all)                   → `t:every(other)`
  //   - `x ?? y` / set intersection              → `t:intersection(other)`
  //   - `LIST_ALL(x)` (union of origin items)    → covered by `t:union(other)`
  //
  // Ink LIST features that have no table equivalent (intentionally
  // closed-by-design):
  //
  //   - Items with intrinsic ordinal values (`LIST n = one=1, two=2`)
  //     — sparkdown authors use `const ONE = 1; const TWO = 2` instead.
  //   - `LIST_ALL(list_name)` — the universe of possible items for a
  //     LIST definition. Tables don't have a separate type/definition;
  //     a table IS its current contents.
  //   - `LIST_INVERT(x)` — complement against the universe. Requires
  //     the type/definition concept above.
  //
  // If these patterns prove painful in practice, sparkdown could add an
  // `enum` keyword that desugars to constants with auto-assigned
  // ordinals — strictly more lightweight than LIST. Not planned today.
  //
  // The save/load test exercises ink's runtime state serialization on
  // LIST values; the equivalent for sparkdown ObjectValues is covered
  // by the existing JSON round-trip infrastructure.
  test("entire inkjs Lists.spec.ts (uses ink LIST type — sparkdown uses tables; see Methods.test.ts)", () => {});
});

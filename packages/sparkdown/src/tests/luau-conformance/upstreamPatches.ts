// Source-level patches applied to vendored upstream fixtures at READ
// time, so the files under `upstream/conformance/` stay VERBATIM
// (per VENDORING.md) while sparkdown can still run assertions that
// bake in Luau IMPLEMENTATION details rather than Lua language
// semantics.
//
// Current patch class — `pairs` iteration order: Lua explicitly
// leaves the traversal order of `pairs`/`next` UNSPECIFIED. Upstream
// fixtures assert Luau's internal hash-bucket order (e.g.
// `{1,2,3,a=5,b=6,c=7}` yielding values "1,2,3,5,7,6" — note b/c
// swapped). Sparkdown's tables are insertion-ordered (JS Map), which
// is deterministic and spec-conformant, so these assertions are
// rewritten to the insertion-order expectation.
//
// Every patch must list the exact upstream text (`find`) — if a
// re-vendor changes the line, the patch silently stops applying and
// the fixture fails again, which is the correct signal to revisit.

export interface UpstreamPatch {
  /** Exact source text to find (must appear verbatim). */
  find: string;
  /** Replacement text. */
  replace: string;
  /** Why this divergence is acceptable. */
  reason: string;
}

export const UPSTREAM_PATCHES: Record<string, UpstreamPatch[]> = {
  "basic.luau": [
    {
      find: `assert((function() local a = {} for k,v in pairs({1, 2, 3, a=5, b=6, c=7}) do a[#a+1] = v end return table.concat(a, ',') end)() == "1,2,3,5,7,6")`,
      replace: `assert((function() local a = {} for k,v in pairs({1, 2, 3, a=5, b=6, c=7}) do a[#a+1] = v end return table.concat(a, ',') end)() == "1,2,3,5,6,7")`,
      reason:
        "pairs order is unspecified in Lua; upstream asserts Luau's hash-bucket order, sparkdown iterates insertion order",
    },
    {
      find: `assert((function() local a = {} for k,v in pairs({1, 2, 3, nil, 4, a=5, b=6, c=7}) do a[#a+1] = v end return table.concat(a, ',') end)() == "1,2,3,4,5,7,6")`,
      replace: `assert((function() local a = {} for k,v in pairs({1, 2, 3, nil, 4, a=5, b=6, c=7}) do a[#a+1] = v end return table.concat(a, ',') end)() == "1,2,3,4,5,6,7")`,
      reason:
        "pairs order is unspecified in Lua; upstream asserts Luau's hash-bucket order, sparkdown iterates insertion order",
    },
    {
      // The kSelectedBiomes "exact table traversal order" test
      // (upstream's own comment calls relying on it "evil"). The
      // expected string is Luau's hash order; sparkdown's is the
      // (also deterministic) insertion order.
      find: `end)() == "ArcticDunesCanyonsWaterMountainsHillsLavaflowPlainsMarsh")`,
      replace: `end)() == "MountainsCanyonsDunesArcticLavaflowHillsPlainsMarshWater")`,
      reason:
        "pairs order is unspecified in Lua; upstream asserts Luau's hash-bucket order, sparkdown iterates insertion order",
    },
  ],
};

/**
 * Apply the registered patches for `fixtureName` to `source`.
 * Unmatched patches are left silently unapplied — the fixture will
 * then fail on the original assertion, which is the signal that a
 * re-vendor changed the line and the patch needs review.
 */
export function applyUpstreamPatches(
  fixtureName: string,
  source: string,
): string {
  const patches = UPSTREAM_PATCHES[fixtureName];
  if (!patches) return source;
  let out = source;
  for (const p of patches) {
    out = out.replace(p.find, p.replace);
  }
  return out;
}

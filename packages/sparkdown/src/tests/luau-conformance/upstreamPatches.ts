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
    {
      // "load error": upstream asserts Luau's exact PARSER message for
      // a bad chunk. Sparkdown has no runtime compiler — its
      // `loadstring` treats every chunk as failing to load and returns
      // `(nil, message)` in the same chunk-id format. The shape of the
      // contract (nil + string message) is what the test exercises.
      find: `assert((function() return concat(loadstring('hello world')) end)() == "nil,[string \\"hello world\\"]:1: Incomplete statement: expected assignment or a function call")`,
      replace: `assert((function() return concat(loadstring('hello world')) end)() == "nil,[string \\"hello world\\"]:1: loadstring is not supported in sparkdown")`,
      reason:
        "sparkdown stories are precompiled (no runtime compiler); loadstring returns (nil, message) for every chunk, with our message text",
    },
  ],
  "vararg.luau": [
    {
      // "varargs for main chunks": compiles vararg-using MAIN CHUNKS
      // at runtime via loadstring. Sparkdown has no runtime compiler
      // and doesn't model main-chunk varargs — but a function literal
      // has IDENTICAL `...` semantics, so the assertions keep their
      // full value with `loadstring[[ ... ]]` swapped for
      // `function(...) ... end`.
      find: `f = loadstring[[ return {...} ]]`,
      replace: `f = function(...) return {...} end`,
      reason:
        "no runtime compiler; main-chunk varargs replaced by a function literal with identical `...` semantics",
    },
    {
      find: `f = loadstring[[
  local x = {...}
  for i=1,select('#', ...) do assert(x[i] == select(i, ...)) end
  assert(x[select('#', ...)+1] == nil)
  return true
]]`,
      replace: `f = function(...)
  local x = {...}
  for i=1,select('#', ...) do assert(x[i] == select(i, ...)) end
  assert(x[select('#', ...)+1] == nil)
  return true
end`,
      reason:
        "no runtime compiler; main-chunk varargs replaced by a function literal with identical `...` semantics",
    },
  ],
  "closure.luau": [
    {
      // "repeat until GC": spins creating garbage until a weak table
      // (`__mode = 'kv'`) loses its entry to the garbage collector.
      // Sparkdown has no GC and no weak tables — `x[1]` never
      // disappears and the loop never exits (it HANGS the suite
      // synchronously, which vitest timeouts can't interrupt).
      // Zero iterations is semantically valid here: the assertions
      // after the loop are written to hold for ANY number of
      // iterations (they add the post-loop `A` at call time).
      find: `while x[1] do   -- repeat until GC
  local a = A..A..A..A  -- create garbage
  A = A+1
end`,
      replace: `while false do   -- [sparkdown] no GC/weak tables; was: while x[1] do
  local a = A..A..A..A  -- create garbage
  A = A+1
end`,
      reason:
        "sparkdown has no garbage collector or weak tables; the GC-detection loop never terminates, so it is disabled (assertions after it hold for any iteration count)",
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
    if (out.includes(p.find)) {
      out = out.replace(p.find, p.replace);
      continue;
    }
    // Windows checkouts materialize the vendored fixtures with CRLF
    // line endings (git text normalization), so multi-line `find`
    // strings written with `\n` won't match verbatim. Retry with the
    // CRLF form before giving up.
    const findCrlf = p.find.replace(/\n/g, "\r\n");
    const replaceCrlf = p.replace.replace(/\n/g, "\r\n");
    out = out.replace(findCrlf, replaceCrlf);
  }
  return out;
}

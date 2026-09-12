# Measure nonvisual changes

All commands run from the worktree root unless stated otherwise.

Before measuring or visually comparing assets, read [asset cache evidence](asset-cache.md). Browser HTTP cache and retained worker caches can mask the changed behavior.

## 3. When the change has no visual signature

Some fixes cannot show up in a screenshot: a perf change, a memory leak, an internal data structure no pixel depends on. Two before/after PNGs that look identical prove nothing, and presenting them as the gate is worse than useless; they read as evidence while carrying none.

For those, the gate is a measured before/after, and it replaces the screenshot rather than sitting alongside a pair of identical images. Still boot the editor and confirm nothing visible broke; just do not dress that up as proof the fix worked.

What makes a timing here honest:

- One candidate per process. A shared process inflates whatever runs second by several times. Run the baseline and the patch as separate commands.
- Interleave and take medians. Run-to-run variance on this machine is large enough to invert a real 2× difference. Three alternating pairs is the minimum.
- When timing a scrub, run one throwaway scrub on a line you will not measure and wait a minute before measuring. The driver refuses a click that would land on the position the caret already holds and says so (`clicked: false` with a reason naming the unchanged selection) rather than clicking and reporting a success that moved nothing, so the throwaway must target a line other than the one you are about to measure. This only helps inside one page session, kept open across both scrubs on a script of your own: the CLI's `verify` reloads the page on every invocation, so a throwaway scrub run through one `verify` call warms nothing for a measurement taken by the next. The scrub path's helpers are reached through the exported `liveDeps` object — `liveDeps.clickLine(page, n)`, `liveDeps.documentLines`, `liveDeps.waitForPreviewSettle` — and are not named exports, so importing them by name fails before a browser launches. The minute is for the preview session itself: a scrub that lands while the first one after a reload is still mid-build races it and mounts a stacked or ahead-of-cursor preview instead of the one that scrub asked for (#456), which would corrupt a timing run far more than it corrupts a screenshot.
- Carry a control: a second measurement the change should not affect. If the control moves as much as the candidate, the pair is noise; measure again.
- Size the fixture until the phase you changed is a visible share of the whole, and check that by timing the phase itself as well as the total. The first fixture reached for is usually too small: a 60-scene and a 400-scene script both put one session's change inside run-to-run noise, and only more content per scene made it readable. If the total moves no more than the control does, the fixture is too small; scale it up rather than concluding there is no effect, and scale what the phase actually processes (content per unit), not just the count of units.
- Report absolute numbers, not just ratios. "2×" hides whether that is 4ms → 8ms or 400ms → 800ms.
- Say where the number came from. If no benchmark in the repo covers the path (several do not; `perfProfile.test.ts` drives `SparkdownCompiler`, whose annotate set excludes `formatting` and `semantics`), say the figure comes from a scratch harness and name what it drove.

Same shape for a memory or count regression: measure the quantity over a fixed number of operations, before and after, and report both numbers.

A screenshot can also be misleading rather than merely uninformative. Display text lays out with collapsing whitespace (the game text style is `white_space: pre-line`), so one space and several look the same on screen while the letter-by-letter typing pauses differently. For anything about whitespace or timing, assert on the string the engine actually consumes and treat the screenshot as a sanity check only. The engine's own test shows the working recipe (`packages/spark-engine/src/game/modules/interpreter/classes/InterpreterModule.test.ts`, `createModule` and `render`): build a bare game context carrying `context.system`, `context.character` and `context.config.interpreter.directives`, construct `new InterpreterModule(game)` and call `setup()`, then `module.parse(source, target).text?.[target] ?? []` is the array of text instructions; join their `.text` fields yourself for the string. `parse` is an instance method, so `InterpreterModule.parse(...)` on the class throws.

A performance cost the fix knowingly carries is a headline, not a footnote: put it at the top of the PR body.

---

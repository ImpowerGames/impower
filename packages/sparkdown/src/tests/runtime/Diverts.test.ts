// Ported from inkjs `src/tests/specs/ink/Diverts.spec.ts`.
//
// Ink knot/stitch divert syntax (`-> knot`, `-> knot.stitch`) maps onto
// sparkdown's `scene` / `branch` declarations with the same divert arrow.
// Top-of-line / fully-resolved diverts work; the tunnel family
// (`-> X ->`, `->->`, multi-target tunnels, tunnel-onwards variants), inline
// mid-line diverts inside display text, divert-target-as-value, divert
// arguments, and ink threads are all deferred — see docs/runtime/DEFERRED.md.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
  runToEnd,
} from "./runtimeTestHarness";

describe("Diverts (ported from inkjs)", () => {
  test("same-line divert is inline", () => {
    // Ink's `text -> target` mid-line divert joins the two segments onto a
    // single output line. The display-body lowerer in `lowerDisplay.ts`
    // detects the nested `Divert` node and emits a `ParsedDivert` inline
    // with the preceding text, so flow transfers seamlessly into the
    // diverted-to scene.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "same-line-divert-is-inline",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe(
      "We hurried home to Savile Row as fast as we could.\n",
    );
  });

  test("DONE stops flow", () => {
    // Renamed from inkjs's "done_stops_thread" — sparkdown doesn't expose
    // ink threads, so "thread" terminology is replaced with "flow" to match
    // what `-> DONE` actually does in our runtime (ends the current flow).
    // The content after `-> DONE` should never run.
    const ctx = makeRuntimeStoryFromFile("diverts", "done-stops-flow");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("");
  });

  // ---- Skipped: compiler-diagnostic tests ----

  test("divert not found surfaces as a compile-time error", () => {
    // `-> nowhere` to an unresolvable name fires inkjs's
    // `target not found` diagnostic during `ExportRuntime`. The
    // sparkdown compile pipeline routes it through `onDiagnostic` to
    // `program.diagnostics` and the harness flattens it into
    // `errorMessages`.
    const { errorMessages } = collectDiagnostics(
      `-> main\nscene main\n  -> nowhere\n`,
    );
    expect(errorMessages.some((m) => m.includes("not found"))).toBe(true);
  });

  test("empty divert outside a choice emits a warning", () => {
    // A bare `->` (no target, not on a choice line) is meaningless —
    // `lowerDivert` detects the empty-buildDivert path and emits a
    // warning. The fallback-choice form `* ->` is handled in
    // `lowerChoice` and doesn't trip this check.
    const { warningMessages } = collectDiagnostics(
      `-> main\nscene main\n  text\n  ->\n  more\n`,
    );
    expect(warningMessages.some((m) => /Empty diverts/.test(m))).toBe(true);
  });

  // ---- Skipped: tunnels and tunnel-onwards (deferred in docs/runtime/DEFERRED.md) ----

  test("basic tunnel (`-> f ->` call + `->->` return)", () => {
    // `-> f ->` pushes a tunnel frame and diverts to scene `f`. When
    // `f` hits `->->`, the runtime pops the frame and resumes right
    // after the tunnel call. The `..` glue strips the trailing newline
    // from `Hello`, so output reads as a single line: "Hello world\n".
    const ctx = makeRuntimeStoryFromFile("diverts", "basic-tunnel");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Hello world\n");
  });

  test("complex tunnels (chained parameterized tunnel calls)", () => {
    // Upstream ink fixture:
    //   -> one(1) -> two(2) ->
    //   three (3)
    //   == one(num) == one ({num}) -> oneAndAHalf(1.5) -> ->->
    //   == oneAndAHalf(num) == one and a half ({num}) ->->
    //   == two(num) == two ({num}) ->->
    //
    // Chains multiple parameterized tunnel calls in a single divert
    // statement. Each non-final target is a tunnel call (pushes a
    // return frame); the final target is plain. Sparkdown's `buildDivert`
    // walks the chain of nested `Tunnel` grammar nodes, emitting one
    // `Divert` per target. `isTunnel=true` on non-final targets so the
    // runtime pushes a return frame; final target's `isTunnel` matches
    // whether a trailing `->` is present.
    const ctx = makeRuntimeStoryFromFile("diverts", "complex-tunnels");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "one (1)\none and a half (1.5)\ntwo (2)\nthree (3)\n",
    );
  });

  test("path to self (tunnel + divert loops back to same label)", () => {
    // The flow: `label dododo` → `-> tunnel ->` (tunnel call) → sticky
    // choice `+ A` → user picks → `->->` returns → `-> dododo`
    // diverts back to the label, looping. After two cycles the story
    // is still runnable (canContinue stays true).
    const ctx = makeRuntimeStoryFromFile("diverts", "path-to-self");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.canContinue).toBe(true);
  });

  test("tunnel onwards after tunnel (`-> X ->->` chained pop)", () => {
    // `-> tunnel2 ->->` inside tunnel1 means: divert to tunnel2 as a
    // tunnel, then when tunnel2 returns (via its own `->->`),
    // immediately pop tunnel1's frame too — landing back at the
    // original caller. The chain emits `Hello...` then `...world.`
    // then the post-tunnel `The End.`
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-after-tunnel",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Hello...\n...world.\nThe End.\n",
    );
  });
  test("tunnel onwards divert after with arg (`->-> b(5 + 3)`)", () => {
    // Tunnel-onwards with a parameterized divert-after: when `a`
    // returns via `->-> b(5+3)`, it pops the tunnel frame and
    // diverts to `b` with arg 8. `b` interpolates `{x}` → "8".
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-divert-after-with-arg",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("8\n");
  });

  test("tunnel onwards divert override (`->-> B` jumps to B, not caller)", () => {
    // `->-> B` (tunnel-onwards with a target) pops the current tunnel
    // frame and diverts to B instead of returning to the caller. So
    // `We will never return to here!` is unreachable; output is just
    // A's body then B's body.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-divert-override",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("This is A\nNow in B.\n");
  });
  test("tunnel onwards with param default choice (`* ->-> elsewhere(8)`)", () => {
    // Inside a tunnel, a fallback choice that's a tunnel-onwards with
    // a parameterized divert-after. Auto-fires (no visible choices),
    // pops the tunnel frame, diverts to `elsewhere(8)` which prints
    // its `x` parameter.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-with-param-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("8\n");
  });

  test("tunnel vs thread behaviour", () => {
    // Contrasts the two control-transfer forms:
    //   `-> tunneled ->`  pauses main flow, runs `tunneled` to its
    //                     `->->` return, then resumes main.
    //   `<- threaded`     spawns `threaded` as a parallel flow that
    //                     runs alongside main; main continues past
    //                     the spawn point without pausing.
    // Both contribute text to the output stream in sequence:
    //   Start. → tunnel content → after-tunnel → thread content
    //          → after-thread → choice.
    // The distinction surfaces in semantics, not in output ordering
    // for this minimal fixture (both happen synchronously between
    // narrative-flow points). The key thing the test pins is that
    // both forms are legal, produce no errors, and route flow
    // correctly through their respective targets.
    const ctx = makeRuntimeStoryFromFile("diverts", "tunnel-vs-thread");
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe(
      "Start.\nIn tunnel.\nAfter tunnel.\nIn thread.\nAfter thread.\n",
    );
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(['"End"']);
  });

  test("compare divert targets with `==` (`-> place` as a first-class value)", () => {
    // `store to_one = -> one` stores a pointer to scene `one` in a
    // variable. Comparing two divert-target values (or comparing a
    // variable against a `-> name` literal) returns true iff they
    // point to the same scene. Inkjs's original fixture uses inline
    // `{cond:a|b}` shorthand; sparkdown rewrites with `if then else`.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "compare-divert-targets",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "different knot\nsame knot\nsame knot\ndifferent knot\nsame knot\nsame knot\n",
    );
  });

  test("divert targets with parameters (`-> place(5)`)", () => {
    // The inkjs fixture also stores the target in a VAR (`VAR x = -> place`)
    // and re-diverts via `-> x(5)`. That requires divert-target-as-value
    // semantics which is a separate slice — this port exercises just
    // the parameter-passing half (`-> place(5)`).
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "divert-targets-with-parameters",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("5\n");
  });

});

describe("Diverts — multi-target tunnels", () => {
  test("`-> A -> B -> C` (last target is plain divert)", () => {
    // Multi-target tunnel chain. Each non-final target is a tunnel
    // call (its `->->` returns control here so the next target can be
    // diverted to). The final target — having no trailing `->` — is a
    // plain divert: when it reaches its terminator (e.g. `-> DONE` or
    // `-> END`), the chain ends without returning to `main`. So
    // "Back at start." doesn't print.
    const ctx = makeRuntimeStoryFromFile("diverts", "multi-target-tunnel");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "In first.\nIn second.\nIn third.\n",
    );
  });

  test("`-> A -> B -> C ->` (trailing arrow makes last target a tunnel too)", () => {
    // Same chain but with a trailing `->` — every target is a tunnel
    // call, including the last. After `third` returns via its `->->`,
    // control comes back to `main` and "Back at start." prints.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "multi-target-tunnel-chain",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "In first.\nIn second.\nIn third.\nBack at start.\n",
    );
  });
});

describe("Diverts — ported from ink fixture rewrites", () => {
  test("divert in conditional (rewrite of inkjs `divert_in_conditional.ink`)", () => {
    // Upstream ink fixture uses an inline conditional alternator with a
    // knot's visit count as the condition (ink reads bare `main` as
    // `READ_COUNT(-> main)`):
    //   === intro = top { main: -> done } -> END = main -> top = done -> END
    // Sparkdown rewrite uses the equivalent block `if` with the explicit
    // `count.visits(-> main)` stdlib builtin. On first run `main` has
    // zero visits, the condition is false, nothing diverts, the scene
    // reaches `-> END`, and output is empty.
    const ctx = makeRuntimeStoryFromFile("diverts", "divert-in-conditional");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("");
  });

  test("tunnel-onwards to a divert-target stored in a function parameter", () => {
    // Upstream ink fixture:
    //   -> outer ->
    //   == outer
    //   This is outer
    //   -> cut_to(-> the_esc)
    //   === cut_to(-> escape)
    //     ->-> escape
    //   == the_esc
    //   This is the_esc
    //   -> END
    //
    // Ink declares `cut_to(-> escape)` — a typed divert-target
    // parameter. Sparkdown has no syntactic marker for typed-divert
    // params, but the runtime accepts any function/scene parameter
    // holding a divert-target value (created via the `-> name` literal
    // at the call site) and `->-> escape` will pop the tunnel frame +
    // divert to whatever target the parameter holds. So the upstream
    // shape ports verbatim apart from dropping the `-> ` from the
    // param declaration — the runtime infers the type from the value.
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "tunnel-onwards-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toMatch(
      "This is outer\nThis is the_esc\n",
    );
  });

  test("divert to weave points (cross-stitch label lookup + alternator-arm divert)", () => {
    // Upstream ink fixture exercises two intertwined features:
    //   1. Diverting to a label that lives inside a `branch` (stitch).
    //      Path is `knot.stitch.gather` / `knot.stitch.choice` —
    //      cross-scope dotted-path lookup.
    //   2. A stopping-alternator (`{chain | ... end}`) whose first arm
    //      is a divert. On first visit the divert transfers control;
    //      on subsequent visits the alternator yields the second arm's
    //      text.
    //
    // Sparkdown supports both:
    //   - branch-nested label lookup works (`Path.GetChildFromContext`
    //     deep-searches via `FlowBase.ContentWithNameAtLevel`)
    //   - alternator-arm diverts now route through a statement-form
    //     `Divert` (see `lowerArms` in `alternatorArms.ts`) instead of
    //     being emitted as `DivertTargetValue` expressions
    const ctx = makeRuntimeStoryFromFile(
      "diverts",
      "divert-to-weave-points",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "gather\ntest\nchoice content\ngather\nsecond time round\n",
    );
  });
});

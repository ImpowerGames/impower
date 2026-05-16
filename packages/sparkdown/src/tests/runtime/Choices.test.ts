// Ported from inkjs `src/tests/specs/ink/Choices.spec.ts`.
//
// Choice text capture (`startContent` / `choiceOnlyContent` /
// `innerContent`) and the `[suppressed]` bracket form ARE done — the
// 3 passing tests below exercise them. The remaining inkjs Choices
// tests all hit at least one of these still-deferred features:
//
//   - ChoiceConditional (`{cond}` guard on `*`)
//   - Fallback / default choices (`* -> target` with no text)
//   - Inline alternators inside choice text (`{a|b|c}`)
//   - Tag-on-choice (`# tag` attached to a choice)
//   - Multiline choice text (text on a subsequent line under the `*`)
//   - Threads (`<- thread_name`)
//   - Tunnels (`-> f -> g`)
//   - Compile-time diagnostics (`Blank choice`, `nested choice`, etc.)
//
// Each skipped test below names its specific blocker.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
} from "./runtimeTestHarness";

describe("Choices (ported from inkjs)", () => {
  test("choice text appears in currentChoices[0].text", () => {
    // `* choice -> DONE` should produce one choice whose `.text` is
    // "choice", and selecting it emits the choice text "choice"
    // (with no trailing newline — the same-line `-> DONE` divert
    // ends the flow without further content). Matches inkjs's
    // `choice_diverts_to_done` test.
    const ctx = makeRuntimeStoryFromFile("choices", "choice-diverts-to-done");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("choice");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("choice");
  });

  test("[suppressed] bracket splits label from chosen output", () => {
    // `* Hello[.], world.` should produce a choice whose label is
    // "Hello." (startContent + choiceOnlyContent) and whose chosen
    // output is "Hello, world." (startContent + innerContent). Tests
    // the three-part choice anatomy through the bracket form.
    const ctx = makeRuntimeStoryFromFile("choices", "weave-options");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices[0]?.text).toBe("Hello.");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("Hello, world.\n");
  });

  test("sticky choices stay sticky after one is chosen", () => {
    // `+ Choice 1 -> test` declares a sticky choice that doesn't get
    // removed from `currentChoices` after being picked. After
    // ChooseChoiceIndex(0), continuing back into the scene should
    // still surface both choices. This test exercises ONLY the
    // sticky-vs-once-only flag — it doesn't check the choice text,
    // which the lowerer doesn't yet capture.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "sticky-choices-stay-sticky",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(2);
  });

  // `choice_diverts_to_done` is ported above as
  // "choice text appears in currentChoices[0].text".
  // `choice_with_brackets_only` is ported above as
  // "[suppressed] bracket splits label from chosen output".

  test("`{cond}` guards filter which choices appear", () => {
    // `* {a} {b} text` shows the choice only when all conditions are
    // true. Multiple `{...}` chain via logical AND. Choices guarded by
    // any false condition are filtered out of `currentChoices`.
    const ctx = makeRuntimeStoryFromFile("choices", "conditional-choices");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  test("choice thread forking — picking a threaded choice resumes flow inside the thread's continuation", () => {
    // Threads "fork" when a player picks one of their choices: flow
    // resumes at the chosen choice's continuation inside the thread's
    // own scene context, NOT back in the spawning scene. This fixture
    // demonstrates the forking by including a tunnel call (`-> deep ->`)
    // in the thread's continuation. Picking "Side enter" should:
    //   1. Echo the choice text.
    //   2. Tunnel into `deep`, emit "Going deep.", `->->` back.
    //   3. Resume in `side_resume`, emit "Back in side_resume."
    // If forking were broken, flow would resume in `hub` instead.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "choice-thread-forking",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Side enter"',
      '"Hub leave"',
    ]);

    ctx.story.ChooseChoiceIndex(0);
    let after = "";
    while (ctx.story.canContinue) after += ctx.story.Continue();
    expect(after).toBe('"Side enter" Going deep.\nBack in side_resume.\n');
  });

  test("choice count reflects threads contributing choices", () => {
    // `count.choices()` (sparkdown's CHOICE_COUNT analog) reports the
    // number of choices accumulated *up to the call site*. Before any
    // thread spawn, the count is 0; immediately after `<- side`, the
    // thread's one choice has been registered so the count is 1; the
    // hub then declares two more, bringing the visible total to 3.
    // The test pins both intermediate counts and the final merged
    // choice menu. Fixture uses `before=` / `after=` instead of
    // colons so the `text: text` dialogue form doesn't trigger.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "choice-count-with-threads",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    // Two interpolated counts on consecutive lines: 0 before the
    // thread spawn, 1 after (the side thread's choice has now
    // registered, the hub's own two choices haven't been declared yet).
    expect(output).toBe("0\n1\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Side one"',
      '"Hub one"',
      '"Hub two"',
    ]);
  });
  test("default (fallback) choice fires when no visible choices remain", () => {
    // `* -> default` with no text is an "invisible default" choice —
    // hidden from `currentChoices`, auto-picked by the runtime when
    // every visible choice has been exhausted. Bracketed-only choices
    // (`* [Choice 1]`) have a label but emit no chosen-output text.
    // After both regular choices are taken, the fallback fires and
    // diverts to the `default` scene.
    const ctx = makeRuntimeStoryFromFile("choices", "default-choices");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.length).toBe(2);

    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("After choice\n");
    expect(ctx.story.currentChoices.length).toBe(1);

    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "After choice\nThis is default.\n",
    );
  });

  test("default simple gather: `* ->` auto-fires and flows to gather", () => {
    // `* ->` is a fallback choice with no target — at compile time it
    // ends up as a loose-end choice with empty innerContent, which
    // inkjs's `Weave.AddRuntimeForGather` resolves by inserting a
    // divert into the choice's runtime container pointing to the next
    // gather. Combined with `isInvisibleDefault`, the runtime
    // auto-picks the fallback and flows into the gather body.
    const ctx = makeRuntimeStoryFromFile("choices", "default-simple-gather");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("x\n");
  });

  test("fallback choice on thread fires when no visible sibling remains", () => {
    // A threaded scene declares a visible choice gated off via
    // `* if false "Unreachable"` and an invisible fallback `* ->
    // defaulted`. The visible one is filtered out (its condition is
    // false), leaving only the fallback. The runtime auto-picks the
    // fallback and diverts to `defaulted`, which emits its content
    // and ends the story.
    //
    // Pins the interaction between three machineries: thread spawn,
    // choice-gating (`* if cond`), and invisible-default fallback
    // (`* ->`). All three must cooperate for the fallback to fire
    // correctly.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "fallback-choice-on-thread",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("Fallback fired.\n");
    expect(ctx.story.currentChoices).toEqual([]);
  });
  test("has-read condition uses scene visit count as boolean", () => {
    // `{ not test }` interpolates as the visit count of scene `test`,
    // which is 0 (unvisited) — so `not test` is true and the choice
    // is visible. `{ test }` is 0 → false → filtered out. Only one
    // visible choice remains.
    const ctx = makeRuntimeStoryFromFile("choices", "has-read-on-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("visible choice");
  });
  test("`{expr}` interpolation inside choice text resolves per section", () => {
    // `{name}` interpolations appear in startContent (label + chosen
    // output), choiceOnlyContent (label only), and innerContent
    // (chosen output only). Each section evaluates the expression
    // when the runtime resolves that piece of text — so picking the
    // choice produces the chosen-output rendering and the label was
    // built from start+choiceOnly.
    const ctx = makeRuntimeStoryFromFile("choices", "logic-in-choices");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices[0]?.text).toBe(
      "'Hello Joe, your name is Joe.'",
    );
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "'Hello Joe,' I said, knowing full well that his name was Joe.\n",
    );
  });

  test("non-text in choice inner content (`option text[].` + interpolation)", () => {
    // Upstream ink fixture:
    //   * option text[]. {true: Conditional bit.} -> next
    // The `[]` splits "option text" (choice label) from
    // ". {true: Conditional bit.}" (chosen output). Picking the choice
    // emits "option text. Conditional bit." then diverts to `next`
    // which adds "Next." Sparkdown rewrites the inline ink conditional
    // `{true: Conditional bit.}` as the luau form
    // `{true and "Conditional bit." or ""}` — equivalent short-circuit.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "non-text-in-choice-inner-content",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "option text. Conditional bit. Next.\n",
    );
  });
  test("once-only choices can link back to self via labeled visit count", () => {
    // `(firstOpt)` labels the first choice. `{ firstOpt }` checks the
    // label's visit count — initially 0, so the second choice is
    // filtered. After picking the first choice (which loops back to
    // `opts`), `firstOpt` has visit-count 1, so the second choice
    // becomes visible. The first choice is once-only so it disappears.
    // A `* -> end_anchor` fallback handles the case after both have
    // been taken.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "once-only-choices-can-link-back-to-self",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("First choice");

    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("Second choice");

    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.errorMessages).toEqual([]);
  });
  test("once only choices with own content (3 once-only choices)", () => {
    // Upstream ink fixture decrements `times` from 3 to 0, looping
    // through 3 once-only choices each iteration. After picking each,
    // the choice disappears (once-only `*`). Final iteration has zero
    // choices left (and `times >= 0` becomes false so the home scene
    // emits "I've finished eating now." and ends).
    //
    // Sparkdown rewrite uses `chain | first | second | third end` for
    // the inline sequential alternator (ink's `{first|second|third}`),
    // and `if cond then -> target end` for the conditional divert
    // (ink's `{cond:->target}`). Choice text uses the `[]` empty-bracket
    // form so the post-bracket innerContent is empty — picking emits
    // only the choice label, not duplicated chosen text.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "once-only-choices-with-own-content",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(3);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(0);
  });
  test("inner fallback bypasses the outer gather", () => {
    // After picking "opt", inner content emits "text", inner choose
    // registers a filtered (`{false}`) choice and a fallback `* -> DONE`,
    // and since no visible choices remain the fallback fires —
    // bypassing the outer `then` gather "gather" entirely.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "should-not-gather-due-to-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("opt\ntext\n");
  });

  test("various default choices (named divert + empty divert)", () => {
    // Mix of two fallback shapes:
    //   - `* -> hello` (named divert) — auto-fires, jumps to label,
    //     bypassing the "Unreachable" line in source order.
    //   - `* ->` (empty divert) — auto-fires, loose-end resolves to
    //     the next gather (the `then` body of its choose block).
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "various-default-choices",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("1\n2\n3\n");
  });

  test("state rollback over default choice", () => {
    // Upstream ink fixture:
    //   <- make_default_choice
    //   Text.
    //   === make_default_choice
    //       *   ->
    //           {5}
    //           -> END
    //
    // Spawns a thread that registers a fallback choice `* ->` and
    // diverts past it. The first Continue emits "Text." from the
    // top-level. The second Continue auto-follows the fallback (via
    // `TryFollowDefaultInvisibleChoice`) into the choice body, emitting
    // `{5}`. State rollback over a default choice requires
    // `isInvisibleDefault` to survive the internal snapshot/restore
    // dance the runtime performs around fallback resolution — fixed
    // by the JSON serialization round-trip in `JsonSerialisation.
    // WriteChoice` / `JObjectToChoice`.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "state-rollback-over-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Text.\n");
    expect(ctx.story.Continue()).toBe("5\n");
  });
  test("blank-bracket choice (`* []`) emits a warning", () => {
    // `* []` parses as a bracketed choice with empty c1/c3/c5 and no
    // divert — inkjs's `InkParser` flags this with "Blank choice ...".
    // Sparkdown's `lowerChoice` mirrors the check.
    const { warningMessages } = collectDiagnostics(
      `-> main\nscene main\n  choose\n    * []\n  end\n`,
    );
    expect(warningMessages.some((m) => /Blank choice/.test(m))).toBe(true);
  });

  test("tags in choice attach to label and chosen output separately", () => {
    // `* one # one [two # two] three # three -> END` — tags inside the
    // startContent and choiceOnlyContent become choice.tags (visible
    // alongside the label "one two"). Tags inside the innerContent
    // emit into currentTags when the choice is taken, alongside the
    // chosen output "one three".
    const ctx = makeRuntimeStoryFromFile("choices", "tags-in-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentTags.length).toBe(0);
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.tags).toEqual(["one", "two"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("one three");
    expect(ctx.story.currentTags).toEqual(["one", "three"]);
  });

  test("`{expr}` interpolation inside choice tag content", () => {
    // `# tag {var1}{var2}` — interpolations inside the tag body
    // evaluate and concatenate into the tag string, so picking the
    // choice produces tag "tag aaabbb" (from `tag ` + `aaa` + `bbb`).
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "dynamic-tags-in-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentTags.length).toBe(0);
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("choice");
    expect(ctx.story.currentChoices[0]?.tags).toEqual(["tag aaabbb"]);
  });

  test("choice text on the line after the choice mark + label", () => {
    // `* (label)\n   text` — the choice mark and label sit on one
    // line and the choice text starts on the next indented line.
    // Sparkdown's grammar already extends the Choice rule across the
    // newline; the lowerer reads the second line's text into
    // `startContent` and the runtime's `CleanOutputWhitespace` trims
    // the leading indent.
    const ctx = makeRuntimeStoryFromFile("choices", "newline-after-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe(
      "I did have one interesting fact about bricklaying, if you don't mind me spending taking a fair bit of time to lay the groundwork for it.",
    );
  });

  test("fallback choices remain hidden after state save/load", () => {
    // `WriteChoice` now emits `isInvisibleDefault: true` for fallback
    // choices, and `JObjectToChoice` reads the flag back (defaulting
    // to false when absent for backward compat). After a `ToJson()` /
    // `LoadJson()` round-trip, the fallback that was being held in
    // `state.currentChoices` (but filtered from `Story.currentChoices`)
    // stays hidden — `TryFollowDefaultInvisibleChoice` can still auto-
    // follow it on the next Continue.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "state-rollback-over-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Text.\n");
    // Pre-save: the fallback is hidden from the user-facing list.
    expect(ctx.story.currentChoices.length).toBe(0);

    const saved = ctx.story.state.ToJson() as string;
    ctx.story.state.LoadJson(saved);

    // Post-load: still hidden (the flag round-tripped).
    expect(ctx.story.currentChoices.length).toBe(0);

    // And the auto-follow path still works after the round-trip.
    expect(ctx.story.Continue()).toBe("5\n");
  });

  test("sequential choose blocks (rewrite of inkjs `- * x` gather-choice pattern)", () => {
    // Upstream ink fixture used the flat-weave `- * x` form to declare
    // a choice immediately after a gather, then another:
    //   - * hello
    //   - * world
    // Each gather-choice pair presents a single choice; after the
    // user picks, control falls through to the next gather, which
    // presents the next choice. Sparkdown expresses the same shape
    // with two sequential `choose ... end` blocks — same observable
    // behavior: pick "hello", then "world" presents.
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "sequential-choose-blocks",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices[0]?.text).toBe("hello");
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    expect(ctx.story.currentChoices[0]?.text).toBe("world");
  });
});

describe.skip("Choices — closed by design (see DIVERGENCES.md)", () => {
  // Sparkdown allows nested `choose` blocks inside `if` blocks (validated
  // by `Builtins.test.ts > turns since nested`), so ink's "nested choice
  // inside conditional" error doesn't apply — the construct that ink
  // rejected is well-formed in sparkdown.
  test("nested choice error (sparkdown allows nested choose-in-if)", () => {});

  // Bare `*` with no content is grammar-ambiguous with the
  // multi-line choice-text form (`*\n  text` extends the choice
  // across the newline) — would need a grammar-level disambiguator.
  test("empty choice warning (grammar-ambiguous with multi-line choice text)", () => {});
});

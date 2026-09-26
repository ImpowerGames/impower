// A `>` anywhere in a display line is a break: the text before it and
// the text after it are separate beats, each its own `Continue()` and its own
// `display()` call. A line holding only `>` is a pause: outside a block it is
// a beat with no text, and inside a block it splits the block. `\>` is a
// literal `>`.

import { describe, expect, test } from "vitest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromDirectory,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const flagged = (story: RuntimeStory, flag: string): boolean =>
  story.currentDisplayInstructions.some(
    (table) =>
      (table.value?.get(flag) as { value?: unknown } | undefined)?.value ===
      true,
  );

// Each beat's visible text, the routing of its table as `target:character`,
// and whether its table asks the player to click through it.
function continueBeats(
  story: RuntimeStory,
): { text: string; routing: string | null; pause: boolean }[] {
  const beats: { text: string; routing: string | null; pause: boolean }[] =
    [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    const routed = displayRouting(story).find((r) => r.target);
    beats.push({
      text,
      routing: routed ? `${routed.target}:${routed.character ?? ""}` : null,
      pause: flagged(story, "pause"),
    });
  }
  return beats;
}

describe("spaced `>` break", () => {
  test("a mid-line break splits a dialogue line into two beats with the same cue", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: Hi. > Bye.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "Hi.\n", routing: "dialogue:HERO", pause: true },
      { text: "Bye.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("a mid-line break splits every display line type", () => {
    const ctx = makeRuntimeStoryFromSource(
      `A > B
^: C > D
$: E > F
%: G > H
@ portrait: I > J
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(
      continueBeats(ctx.story).map((beat) => [beat.text, beat.routing]),
    ).toEqual([
      ["A\n", "action:"],
      ["B\n", "action:"],
      ["C\n", "title:"],
      ["D\n", "title:"],
      ["E\n", "heading:"],
      ["F\n", "heading:"],
      ["G\n", "transitional:"],
      ["H\n", "transitional:"],
      ["I\n", "portrait:"],
      ["J\n", "portrait:"],
    ]);
  });

  test("a lone `>` after a dialogue line is a beat with no text that pauses", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: Hi.\n>\nHERO: Bye.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "Hi.\n", routing: "dialogue:HERO", pause: false },
      { text: "\n", routing: "action:", pause: true },
      { text: "Bye.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("`> Hello` is a lone `>` followed by a `Hello` line", () => {
    const ctx = makeRuntimeStoryFromSource(`> Hello\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "\n", routing: "action:", pause: true },
      { text: "Hello\n", routing: "action:", pause: false },
    ]);
  });

  test("a lone `>` inside a block splits it without an empty beat", () => {
    const ctx = makeRuntimeStoryFromSource(
      `HERO:
  Hi.
  >
  Bye.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "Hi.\n", routing: "dialogue:HERO", pause: true },
      { text: "Bye.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("a break on a glued continuation ends the joined beat", () => {
    for (const source of [
      `HERO: Hi. ..\n.. more > Bye.\n`,
      `HERO: Hi. ..\nHERO: .. more > Bye.\n`,
    ]) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("Hi. more\n");
      expect(displayRouting(ctx.story).find((r) => r.target)).toEqual({
        target: "dialogue",
        character: "HERO",
      });
      expect(flagged(ctx.story, "pause")).toBe(true);
      // An action continuation's beat after the break asks for the routing
      // of the beat the run joined the continuation to (`inherit`), and names
      // the line the source reads before it for a run that never queued that
      // beat. A continuation that names its speaker routes by its own cue.
      expect(ctx.story.Continue()).toBe("Bye.\n");
      expect(displayRouting(ctx.story)).toEqual([
        { target: "dialogue", character: "HERO" },
      ]);
      expect(flagged(ctx.story, "inherit")).toBe(!source.includes("HERO: .."));
      expect(ctx.story.Continue()).toBe("");
      expect(ctx.story.canContinue).toBe(false);
    }
  });

  test("two breaks in a row keep the empty beat between them", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: A > >\nNext.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "A\n", routing: "dialogue:HERO", pause: true },
      { text: "\n", routing: "dialogue:HERO", pause: true },
      { text: "Next.\n", routing: "action:", pause: false },
    ]);
  });

  test("a block whose body is only `>` adds no beat that waits", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO:\n  >\nNext.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story).map((beat) => beat.pause)).toEqual([
      false,
      false,
    ]);
  });

  test("a continuation held open by a trailing `..` chain keeps the cue", () => {
    for (const source of [
      `HERO: A ..\n.. B ..\n.. C > D\n`,
      `HERO: A ..\nHERO: .. B ..\n.. C > D\n`,
    ]) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("A B C\n");
      expect(ctx.story.Continue()).toBe("D\n");
      // The beat after the break inherits at run time, and names HERO for a
      // run that never queued the beat it joins.
      expect(displayRouting(ctx.story)).toEqual([
        { target: "dialogue", character: "HERO" },
      ]);
    }
  });

  test("continuations of different files are named apart", () => {
    // Source offsets start again in every script, so both continuations of
    // this fixture begin at the same offset in their own file. What a beat
    // may inherit from is decided by that name, so the two must differ; a run
    // that reaches one of them with the other's routing remembered — which
    // takes a jump straight into the second file — would otherwise wear the
    // wrong cue.
    const ctx = makeRuntimeStoryFromDirectory("display", "continuation-groups");
    expect(ctx.errorMessages).toEqual([]);
    const groups = new Set<string>();
    const cues: string[] = [];
    while (ctx.story.canContinue) {
      ctx.story.Continue();
      for (const table of ctx.story.currentDisplayInstructions) {
        const group = (
          table.value?.get("group") as { value?: unknown } | undefined
        )?.value;
        if (group != null) groups.add(String(group));
      }
      const routed = displayRouting(ctx.story).find((r) => r.target);
      if (routed?.character) cues.push(routed.character);
    }
    expect([...groups].length).toBe(2);
    expect(cues).toEqual(["HERO", "HERO", "EVIL", "EVIL"]);
  });

  test("a line's tags stay with the beat its line-end break ends", () => {
    const ctx = makeRuntimeStoryFromSource(
      `HERO:\n  Hi. > # first\n  Bye. # second\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Hi.\n");
    expect(ctx.story.currentTags).toEqual(["first"]);
    expect(ctx.story.Continue()).toBe("Bye.\n");
    expect(ctx.story.currentTags).toEqual(["second"]);
  });

  test("a picture line ending in `>` pauses", () => {
    const ctx = makeRuntimeStoryFromSource(`[[cg_sunset]] >\nNext.\n`);
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.map((beat) => beat.pause)).toEqual([true, false]);
    expect(beats[1]!.text).toBe("Next.\n");
  });

  test("`\\>` writes a literal spaced `>`", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: Hi \\> Bye.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "Hi > Bye.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("each `>` of `>>` and the `>` of `>=` is a break", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: c >> d, e >= f.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "c\n", routing: "dialogue:HERO", pause: true },
      { text: "\n", routing: "dialogue:HERO", pause: true },
      { text: "d, e\n", routing: "dialogue:HERO", pause: true },
      { text: "= f.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("the `>` that closes a text command is not a break", () => {
    const ctx = makeRuntimeStoryFromSource(`HERO: Go <wait 1 > now.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual([
      { text: "Go <wait 1 > now.\n", routing: "dialogue:HERO", pause: false },
    ]);
  });

  test("`>` stays literal in expressions and choice text", () => {
    const ctx = makeRuntimeStoryFromSource(
      `HERO: {2 > 1} is true.
choose
  + [Go > there] You go > there.
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("true is true.\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "Go > there",
    ]);
    ctx.story.ChooseChoiceIndex(0);
    expect(continueBeats(ctx.story).map((beat) => beat.text)).toEqual([
      "You go > there.\n",
    ]);
  });
});

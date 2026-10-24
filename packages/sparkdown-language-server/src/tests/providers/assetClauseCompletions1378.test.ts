import { describe, expect, it } from "vitest";
import { complete as completeAt } from "./completionHarness";

// The clauses offered inside `[[…]]` and `((…))` (I-1378): a clause the
// command already has is not offered again, wherever the cursor sits after
// it, and a word typed after a name or after a clause may be the start of a
// clause, so the clauses are offered there too.

const program = {
  context: {
    image: { forest: { $type: "image", $name: "forest" } },
    video: { bunny_idle: { $type: "video", $name: "bunny_idle", src: "bunny_idle.webm" } },
  },
} as any;

const labels = (source: string) =>
  completeAt(source.replace("|", "@0"), { program }).labels;

describe("clauses already written are not offered again (I-1378)", () => {
  it.each([
    ["[[show backdrop bunny_idle with fade |]]", "with", "loop"],
    ["[[show backdrop bunny_idle loop |]]", "loop", "once"],
    ["[[show backdrop bunny_idle loop lo|]]", "loop", "once"],
    ["[[show backdrop bunny_idle with fade lo|]]", "with", "mute"],
    ["((play music theme loop |))", "loop", "once"],
    ["((play music theme loop lo|))", "loop", "mute"],
    // The cases of I-1597: the cursor at the end, and between clauses.
    ["[[show portrait bunny over 1s |]]", "over", "after"],
    ["[[show portrait bunny over 1s | with shake]]", "over", "after"],
    ["[[show portrait bunny over 1s | with shake]]", "with", "wait"],
    ["((play music theme loop | over 1s))", "loop", "once"],
    ["((play music theme loop | over 1s))", "over", "after"],
  ])("%s offers no %s, still %s", (source, written, other) => {
    const offered = labels(source);
    expect(offered).not.toContain(written);
    expect(offered).toContain(other);
  });
});

describe("a word typed after a name or a clause may start a clause (I-1378)", () => {
  it.each([
    ["[[show backdrop bunny_idle lo|]]", "loop"],
    ["[[animate backdrop bunny_idle wi|]]", "with"],
    ["[[show backdrop bunny_idle loop on|]]", "once"],
    ["[[show backdrop bunny_idle with fade wa|]]", "wait"],
    ["[[show backdrop bunny_idle over 2s wa|]]", "wait"],
    ["((play music theme lo|))", "loop"],
    ["((play music theme loop mu|))", "mute"],
  ])("%s offers %s", (source, clause) => {
    expect(labels(source)).toContain(clause);
  });

  it("still offers names after a name, since a command can show several", () => {
    expect(labels("[[show backdrop forest bun|]]")).toContain("bunny_idle");
  });

  it("offers no clause for the first name or one joined with +", () => {
    expect(labels("[[show backdrop bun|]]")).not.toContain("with");
    expect(labels("[[show backdrop forest+bun|]]")).not.toContain("with");
  });

  it("keeps a clause's value position for its values", () => {
    expect(labels("[[show backdrop bunny_idle with fa|]]")).not.toContain("loop");
  });
});

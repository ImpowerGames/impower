// A durable save loaded into a program that differs (#1429,
// docs/engine/binary-program.md, section 8): each saved position is placed by
// the alignment of its listing with the program's (matching blocks, then the
// statement's own neighbourhood in every sequence, then its neighbours as an
// edited statement), a body by its part, a renamed flow renames what the save
// says about it, and a save falls back through its beats when a position
// cannot be placed. Each fixture states the ordinal the design places the
// save at, which differs from the ordinal the save names, so that keeping
// the old ordinal gives another answer.
import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { SaveRefused } from "../../program/ProgramSave";
import { ProgramStory } from "../../program/ProgramStory";
import { countIdOf } from "../../program/ProgramSymbols";
import { chunkOfAddress } from "../../program/ProgramChunk";
import { compileScript, programSession } from "./programHarness";

const silence = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const rootOf = (text: string): ProgramRoot => {
  const program = silence(() => compileScript(text).program);
  expect(program.chunks).toBeDefined();
  return program.chunks!;
};

const engine = (root: ProgramRoot, saveHistory?: number): ProgramStory => {
  const story = new ProgramStory(root, { saveHistory });
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

const shown = (story: ProgramStory) => story.currentText?.trim() ?? "";

/** The next `count` beats that show something. */
const advance = (story: ProgramStory, count: number): string[] => {
  const out: string[] = [];
  while (story.canContinue && out.length < count) {
    story.Continue();
    if (shown(story)) out.push(shown(story));
  }
  return out;
};

/** The beats to the end, taking `picks` at the menus in turn. */
const play = (story: ProgramStory, picks: number[] = []): { beats: string[]; menus: string[][] } => {
  const beats: string[] = [];
  const menus: string[][] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    while (story.canContinue) {
      story.Continue();
      if (shown(story)) beats.push(shown(story));
    }
    const choices = story.currentChoices;
    if (choices.length === 0) break;
    menus.push(choices.map((c) => c.text));
    if (picks.length === 0) break;
    story.ChooseChoiceIndex(picks.shift()!);
  }
  return { beats, menus };
};

const scene = (lines: string[], name = "start", header: string[] = []) =>
  [...header, `-> ${name}`, "", `scene ${name}`, ...lines.map((l) => `  ${l}`), "end", ""].join("\n");

/** Where the story stands: its flow's qualified name, the statement's
 *  ordinal in its sequence, and for a body, the owner's ordinal in the
 *  sequence that holds it. */
const placed = (story: ProgramStory) => {
  const position = story.state.position!;
  const sequence = position.sequence;
  const owner = story.root.ownerOf(sequence);
  return {
    flow: story.root.table.symbols[sequence.flow],
    entry: position.entry,
    ...(owner ? { owner: owner.entry } : {}),
  };
};

/** Where the newest beat of a save stands, as it names it: the flow of its
 *  first level, the ordinal of its last level and, for a body, its owner's
 *  ordinal. */
const savedAt = (save: string) => {
  const beat = JSON.parse(save).beats.at(-1);
  const levels = beat.position.st.levels as { at: number; flow?: string }[];
  return {
    flow: levels[0]!.flow,
    entry: levels.at(-1)!.at,
    ...(levels.length > 1 ? { owner: levels.at(-2)!.at } : {}),
  };
};

/** A count by its symbol's qualified name. */
const countOf = (story: ProgramStory, name: string): number => {
  const symbol = story.root.table.symbolIds.get(name);
  const id = symbol === undefined ? -1 : countIdOf(story.root.table, symbol);
  return id < 0 ? 0 : (story.state.visits[id] ?? 0);
};

const global = (story: ProgramStory, name: string) =>
  story.variablesState.GetVariableWithName(name);

/**
 * Plays `before` for `beats` beats and saves, loads the save into `after`,
 * and checks that the newest beat was placed exactly where the fixture says
 * (`expected`), that the save named another ordinal there, and that the
 * story runs on as `rest` says.
 */
const placesAt = (
  before: string,
  after: string,
  beats: number,
  expected: { flow: string; entry: number; owner?: number },
  rest: string[],
) => {
  const story = engine(rootOf(before));
  expect(advance(story, beats)).toHaveLength(beats);
  const save = story.toSave();
  const saved = savedAt(save);
  // Keeping the saved ordinal gives another answer than the design's.
  expect(saved).not.toEqual(expected);
  const loaded = engine(rootOf(after));
  loaded.loadSave(save);
  const report = loaded.loadedSaveReport!;
  expect(report.beat).toBe(report.beats - 1);
  expect(report.exact).toBe(true);
  expect(placed(loaded)).toEqual(expected);
  expect(play(loaded).beats).toEqual(rest);
  return { save, loaded };
};

describe("a save taken below an edit loads at the same statement", () => {
  it("after a statement was inserted above it", () => {
    placesAt(
      scene(["One.", "Two.", "Three.", "Four."]),
      scene(["Zero.", "One.", "Two.", "Three.", "Four."]),
      2,
      // "Three." was ordinal 2.
      { flow: "start", entry: 3 },
      ["Three.", "Four."],
    );
  });

  it("after an edit to the statement's own text, paired with it as an edited statement", () => {
    placesAt(
      scene(["One.", "Two.", "Three.", "Four."]),
      scene(["Zero.", "One.", "Two.", "Three, edited.", "Four."]),
      2,
      { flow: "start", entry: 3 },
      ["Three, edited.", "Four."],
    );
  });

  it("after edits to both of its neighbours", () => {
    placesAt(
      scene(["A.", "B.", "C.", "D.", "E."]),
      scene(["Z.", "A.", "B, edited.", "C.", "D, edited.", "E."]),
      2,
      // "C." was ordinal 2.
      { flow: "start", entry: 3 },
      ["C.", "D, edited.", "E."],
    );
  });

  it("after it was moved with its neighbours to another place in the flow", () => {
    placesAt(
      scene(["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H."]),
      scene(["A.", "B.", "F.", "G.", "H.", "C.", "D.", "E."]),
      3,
      // "D." was ordinal 3.
      { flow: "start", entry: 6 },
      ["D.", "E."],
    );
  });

  it("after its body was moved under another owner", () => {
    const header = ["store x = 1", ""];
    placesAt(
      scene(
        [
          "if x == 1 then",
          "  P1.",
          "  P2.",
          "  P3.",
          "  P4.",
          "end",
          "if x == 2 then",
          "  Q.",
          "end",
          "After.",
        ],
        "start",
        header,
      ),
      scene(
        [
          "if x == 1 then",
          "  New.",
          "end",
          "if x >= 1 then",
          "  P0.",
          "  P1.",
          "  P2.",
          "  P3.",
          "  P4.",
          "end",
          "After.",
        ],
        "start",
        header,
      ),
      2,
      // "P3." was ordinal 2 of the first `if`'s body, and is ordinal 3 of
      // the second's.
      { flow: "start", owner: 1, entry: 3 },
      ["P3.", "P4.", "After."],
    );
  });

  it("after its block was moved to another flow", () => {
    const header = ["store x = 1", ""];
    placesAt(
      scene(
        ["A.", "B.", "if x == 1 then", "  X1.", "  X2.", "  X3.", "end", "C."],
        "start",
        header,
      ),
      [
        ...header,
        "-> start",
        "",
        "scene start",
        "  A.",
        "  B.",
        "  -> other",
        "end",
        "",
        "scene other",
        "  O1.",
        "  if x == 1 then",
        "    X1.",
        "    X2.",
        "    X3.",
        "  end",
        "  O2.",
        "end",
        "",
      ].join("\n"),
      3,
      // The `if` was ordinal 2 of `start`, and is ordinal 1 of `other`.
      { flow: "other", owner: 1, entry: 1 },
      ["X2.", "X3.", "O2."],
    );
  });

  it("after its run was moved to another flow with unrelated statements in the vacated place", () => {
    const other = ["", "scene other", "  P.", "  Q.", "end", ""];
    placesAt(
      scene(["A.", "B.", "C.", "D.", "E."]) + other.join("\n"),
      scene(["A.", "X.", "Y.", "Z.", "E."]) +
        ["", "scene other", "  P.", "  Q.", "  B.", "  C.", "  D.", "end", ""].join("\n"),
      2,
      // Placed in `other`, where "C." is ordinal 3, and not at "Y.", which
      // the pairing in `start` would give.
      { flow: "other", entry: 3 },
      ["C.", "D."],
    );
  });

  it("at its edited self when it was edited in place while an equal statement was inserted elsewhere", () => {
    placesAt(
      scene(["A.", "S.", "B.", "C."]),
      scene(["W.", "A.", "T.", "B.", "C.", "S."]),
      1,
      // "S." was ordinal 1; "T." stands in its place, at ordinal 2, and the
      // inserted "S." at 5 is not it.
      { flow: "start", entry: 2 },
      ["T.", "B.", "C.", "S."],
    );
  });

  it("presents the same menu, and not its neighbour's, at a menu between two distinct adjacent choose blocks after a third was inserted above them", () => {
    const blocks = (yellow: boolean) =>
      scene([
        "Intro.",
        ...(yellow ? ["choose", "  * [Yellow]", "    Picked yellow.", "end"] : []),
        "choose",
        "  * [Red]",
        "    Picked red.",
        "end",
        "choose",
        "  * [Green]",
        "    Picked green.",
        "  * [Blue]",
        "    Picked blue.",
        "end",
        "After.",
      ]);
    // At the first block's menu: the beat before it stands at the block.
    const story = engine(rootOf(blocks(false)));
    expect(advance(story, 1)).toEqual(["Intro."]);
    story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Red"]);
    const first = story.toSave();
    expect(savedAt(first)).toEqual({ flow: "start", entry: 1 });
    // At the second block's menu, after "Picked red.": the beat before it
    // stands at the end of the red choice's body.
    story.ChooseChoiceIndex(0);
    expect(advance(story, 1)).toEqual(["Picked red."]);
    story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Green", "Blue"]);
    const second = story.toSave();
    expect(savedAt(second)).toEqual({ flow: "start", owner: 1, entry: 1 });
    const loaded = engine(rootOf(blocks(true)));
    loaded.loadSave(first);
    // The red block is ordinal 2 now; ordinal 1 is the yellow one.
    expect(placed(loaded)).toEqual({ flow: "start", entry: 2 });
    expect(play(loaded, [0])).toEqual({
      beats: ["Picked red."],
      menus: [["Red"], ["Green", "Blue"]],
    });
    const again = engine(rootOf(blocks(true)));
    again.loadSave(second);
    expect(placed(again)).toEqual({ flow: "start", owner: 2, entry: 1 });
    expect(play(again, [1])).toEqual({
      beats: ["Picked blue.", "After."],
      menus: [["Green", "Blue"]],
    });
  });
});

describe("a save inside a flow that was renamed", () => {
  const ACT = (name: string) =>
    [
      "store target = nil",
      "store hops = 0",
      "",
      `-> ${name}`,
      "",
      `scene ${name}`,
      `  -> ${name}.first`,
      "  branch first",
      "    label top",
      `    First {${name}} {${name}.first} {${name}.second}.`,
      "    & hops = hops + 1",
      "    if hops == 1 then",
      `      & target = -> ${name}.second`,
      "      -> target",
      "    end",
      "    M1.",
      "    M2.",
      "    M3.",
      `    Turns {TURNS_SINCE(-> ${name}.first.top)} {${name}}.`,
      `    if ${name}.second > 0 then`,
      "      Gated.",
      "    else",
      "      Open.",
      "    end",
      "    Last.",
      "    -> target",
      "  end",
      "  branch second",
      "    In second {hops}.",
      "    if hops < 2 then",
      `      -> ${name}.first`,
      "    end",
      "  end",
      "end",
      "",
    ].join("\n");

  it("loads at the same statement, with the scene's count, a sibling branch's count, the turns since a label and a variable holding the sibling's symbol renamed with it", () => {
    const story = engine(rootOf(ACT("ACT")));
    expect(advance(story, 4)).toEqual(["First 1 1 0.", "In second 1.", "First 1 2 1.", "M1."]);
    const counts = (s: ProgramStory, name: string) =>
      [name, `${name}.first`, `${name}.second`, `${name}.first.top`].map((n) => countOf(s, n));
    const before = counts(story, "ACT");
    expect(before).toEqual([1, 2, 1, 2]);
    const save = story.toSave();
    const rest = play(story).beats;
    expect(rest).toEqual(["M2.", "M3.", "Turns 0 1.", "Gated.", "Last.", "In second 2."]);
    const loaded = engine(rootOf(ACT("PLAY")));
    loaded.loadSave(save);
    // "M2." was ordinal 5 of `ACT.first`, which the program no longer has;
    // it is ordinal 5 of `PLAY.first`, which the save does not name.
    expect(savedAt(save)).toEqual({ flow: "ACT.first", entry: 5 });
    expect(placed(loaded)).toEqual({ flow: "PLAY.first", entry: 5 });
    expect(savedAt(save).flow).toBe("ACT.first");
    expect(counts(loaded, "PLAY")).toEqual(before);
    // The branch the sibling's count gated is still gated, and the variable
    // that held the sibling's symbol still diverts to it.
    expect(play(loaded).beats).toEqual(rest);
  });

  it("rewrites only its own name when its branch moved under a scene that still exists", () => {
    const before = [
      "-> A",
      "",
      "scene A",
      "  A starts.",
      "  -> A.b",
      "  branch b",
      "    B one.",
      "    B two.",
      "    B three.",
      "    B four.",
      "    -> report",
      "  end",
      "end",
      "",
      "scene C",
      "  C starts.",
      "end",
      "",
      "scene report",
      "  Report {A}.",
      "end",
      "",
    ].join("\n");
    const after = [
      "-> A",
      "",
      "scene A",
      "  A starts.",
      "  -> C.b",
      "end",
      "",
      "scene C",
      "  C starts.",
      "  branch b",
      "    B one.",
      "    B two.",
      "    B three.",
      "    B four.",
      "    -> report",
      "  end",
      "end",
      "",
      "scene report",
      "  Report {A} {C} {C.b}.",
      "end",
      "",
    ].join("\n");
    const story = engine(rootOf(before));
    expect(advance(story, 3)).toEqual(["A starts.", "B one.", "B two."]);
    const save = story.toSave();
    const loaded = engine(rootOf(after));
    loaded.loadSave(save);
    expect(placed(loaded)).toEqual({ flow: "C.b", entry: 2 });
    // `A` keeps its count, `C` takes none of it, and `A.b`'s goes to `C.b`.
    expect(play(loaded).beats).toEqual(["B three.", "B four.", "Report 1 0 1."]);
  });
});

// Round 1 of the review of #1654 (report 6030606004).
describe("the beats of a save loaded into a release that differs", () => {
  it("rename a flow that only an older beat stands in, before the counts are read", () => {
    const ACT = (name: string) =>
      [
        `-> ${name}`,
        "",
        `scene ${name}`,
        `  -> ${name}.b`,
        "  branch b",
        "    B1.",
        "    B2.",
        "    B3.",
        "    B4.",
        "    -> report",
        "  end",
        "end",
        "",
        "scene report",
        "  R1.",
        "  R2.",
        "  R3.",
        `  Counts {${name}} {${name}.b}.`,
        "end",
        "",
      ].join("\n");
    const story = engine(rootOf(ACT("ACT")));
    expect(advance(story, 6)).toEqual(["B1.", "B2.", "B3.", "B4.", "R1.", "R2."]);
    const save = story.toSave();
    // The newest beat stands in `report`, which is unchanged.
    expect(savedAt(save)).toEqual({ flow: "report", entry: 2 });
    const loaded = engine(rootOf(ACT("PLAY")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(report.beats - 1);
    expect(play(loaded).beats).toEqual(["R3.", "Counts 1 1."]);
  });

  it("keep a tunnel's frame into a renamed flow, whose function is read by its new name", () => {
    const TUNNEL = (name: string) =>
      [
        "-> start",
        "",
        "scene start",
        "  Before.",
        `  -> ${name}.b ->`,
        "  After.",
        "end",
        "",
        `scene ${name}`,
        "  branch b",
        "    B1.",
        "    B2.",
        "    B3.",
        "    B4.",
        "    ->->",
        "  end",
        "end",
        "",
      ].join("\n");
    const story = engine(rootOf(TUNNEL("ACT")));
    expect(advance(story, 3)).toEqual(["Before.", "B1.", "B2."]);
    const save = story.toSave();
    const loaded = engine(rootOf(TUNNEL("PLAY")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(report.beats - 1);
    expect(report.exact).toBe(true);
    expect(placed(loaded)).toEqual({ flow: "PLAY.b", entry: 2 });
    expect(play(loaded).beats).toEqual(["B3.", "B4.", "After."]);
  });

  // Round 1 of the review of #1654 (report 6031317072).
  it("keep the value a beat had of a global whose initial value the release changed", () => {
    const story = engine(rootOf(scene(["First.", "Second {coins}."], "start", ["store coins = 1", ""])));
    expect(advance(story, 1)).toEqual(["First."]);
    const save = story.toSave();
    const loaded = engine(rootOf(scene(["First.", "Second {coins}."], "start", ["store coins = 2", ""])));
    loaded.loadSave(save);
    expect(play(loaded).beats).toEqual(["Second 1."]);
  });

  it("save again after a function value the release no longer has was loaded as one that names nothing", () => {
    const story = engine(
      rootOf(scene(["& cb = function() return 1 end", "One.", "Two.", "Three."], "start", ["store cb = nil", ""])),
    );
    expect(advance(story, 1)).toEqual(["One."]);
    const save = story.toSave();
    const release = scene(["One.", "Two.", "Three."], "start", ["store cb = nil", ""]);
    const loaded = engine(rootOf(release));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.warnings.join(" ")).toMatch(/names nothing/);
    expect(advance(loaded, 1)).toEqual(["Two."]);
    const again = loaded.toSave();
    const reloaded = engine(rootOf(release));
    reloaded.loadSave(again);
    expect(play(reloaded).beats).toEqual(["Three."]);
  });

  // Round 1 of the review of #1654 (report 6031983271).
  it("tell apart two displayed lines that differ inside a string of their interpolation, a `//` included", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", 'Line {"a // b"}.', "End."]),
      scene(["P1.", "P2.", "P3.", 'Line {"a // c"}.', 'Line {"a // b"}.', "End."]),
      3,
      // The `a // b` line was ordinal 3, and is ordinal 4.
      { flow: "start", entry: 4 },
      ["Line a // b.", "End."],
    );
  });

  // Round 2 of the review of #1654 (report 6032759458, finding 2): a long
  // string in an interpolation, holding a brace and a `//`.
  it("tell apart two displayed lines that differ inside a long string of their interpolation, a brace and a `//` included", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "Line {[[a } // b]]}.", "End."]),
      scene(["P1.", "P2.", "P3.", "Line {[[a } // c]]}.", "Line {[[a } // b]]}.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line a } // b.", "End."],
    );
  });

  // The other tokens of an interpolation whose text may hold a brace or a
  // `//`, and of a line of logic whose text may hold a `--`.
  it("tell apart two displayed lines that differ after a block comment of their interpolation holding a brace and a `//`", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", 'Line {--[[ } // ]] "b"}.', "End."]),
      scene(["P1.", "P2.", "P3.", 'Line {--[[ } // ]] "c"}.', 'Line {--[[ } // ]] "b"}.', "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line b.", "End."],
    );
  });

  it("tell apart two displayed lines that differ after a regex literal of their interpolation holding a brace", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", 'Line {@/}/ and " // b"}.', "End."]),
      scene(["P1.", "P2.", "P3.", 'Line {@/}/ and " // c"}.', 'Line {@/}/ and " // b"}.', "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line // b.", "End."],
    );
  });

  // Round 2 of the review of #1654 (report 6038272271, finding 3): a
  // template string nested in a template string's interpolation.
  it("tell apart two displayed lines that differ inside a template string nested in their interpolation's template, a brace and a `//` included", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "Line {`{`a } // b`}`}.", "End."]),
      scene(["P1.", "P2.", "P3.", "Line {`{`a } // c`}`}.", "Line {`{`a } // b`}`}.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line a } // b.", "End."],
    );
  });

  it("tell apart two displayed lines that differ inside a `\"` string whose interpolation holds a string with a `\"`", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "Line {\"{'\"'} // b\"}.", "End."]),
      scene(["P1.", "P2.", "P3.", "Line {\"{'\"'} // c\"}.", "Line {\"{'\"'} // b\"}.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ['Line " // b.', "End."],
    );
  });

  it("tell apart two lines of logic that differ inside a template string nested in a template's interpolation, a `--` included", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "& local s = `{`a -- b`}`", "Shown.", "End."]),
      scene(["P1.", "P2.", "P3.", "& local s = `{`a -- c`}`", "& local s = `{`a -- b`}`", "Shown.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Shown.", "End."],
    );
  });

  // Round 3 of the review of #1654 (report 6039459012): a string continued
  // past its line, whose next line starts with what would be a comment.
  it("tell apart two calls that differ inside a string continued by `\\z` onto a line that starts with `--`", () => {
    const call = (text: string) => [String.raw`& table.insert(t, "a\z`, `-- ${text}")`];
    placesAt(
      scene(["P1.", "P2.", "P3.", ...call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      scene(["P1.", "P2.", "P3.", ...call("c"), ...call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      3,
      { flow: "start", entry: 4 },
      ["Count 1."],
    );
  });

  it("tell apart two calls that differ inside a string continued by an escaped line end onto a line that starts with `--`", () => {
    const call = (text: string) => [String.raw`& table.insert(t, "a\ `.trimEnd(), `-- ${text}")`];
    placesAt(
      scene(["P1.", "P2.", "P3.", ...call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      scene(["P1.", "P2.", "P3.", ...call("c"), ...call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      3,
      { flow: "start", entry: 4 },
      ["Count 1."],
    );
  });

  it("tell apart two displayed lines that differ after an interpolation runs onto a line that starts with `//`", () => {
    const line = (text: string) => ['Line {"a" ..', `" // ${text}"}.`];
    placesAt(
      scene(["P1.", "P2.", "P3.", ...line("b"), "End."]),
      scene(["P1.", "P2.", "P3.", ...line("c"), ...line("b"), "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line a // b.", "End."],
    );
  });

  // Round 3 of the review of #1654 (report 6040464865, finding 1): markup
  // whose text a `//` is part of.
  it("tell apart two displayed lines that differ after a `//` in a raw span", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "Line `a // b`.", "End."]),
      scene(["P1.", "P2.", "P3.", "Line `a // c`.", "Line `a // b`.", "End."]),
      3,
      { flow: "start", entry: 4 },
      // The text the story gives keeps its markup: the `//` is text.
      ["Line `a // b`.", "End."],
    );
  });

  it("tell apart two displayed lines that differ after a `//` in bold text", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "Line **a // b**.", "End."]),
      scene(["P1.", "P2.", "P3.", "Line **a // c**.", "Line **a // b**.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line **a // b**.", "End."],
    );
  });

  // Round 4 of the review of #1654 (report 6041582476): a long bracket's
  // `=` run has no bound.
  it("tell apart two calls that differ inside a long string whose brackets hold 63 `=`", () => {
    const eq = "=".repeat(63);
    const call = (text: string) => `& table.insert(t, [${eq}[a--${text}]${eq}])`;
    placesAt(
      scene(["P1.", "P2.", "P3.", call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      scene(["P1.", "P2.", "P3.", call("c"), call("b"), "Count {#t}."], "start", ["store t = {}", ""]),
      3,
      { flow: "start", entry: 4 },
      ["Count 1."],
    );
  });

  it("tell apart two displayed lines that differ inside a long string of their interpolation whose brackets hold 63 `=`", () => {
    const eq = "=".repeat(63);
    const line = (text: string) => `Line {[${eq}[a } // ${text}]${eq}]}.`;
    placesAt(
      scene(["P1.", "P2.", "P3.", line("b"), "End."]),
      scene(["P1.", "P2.", "P3.", line("c"), line("b"), "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Line a } // b.", "End."],
    );
  });

  it("tell apart two lines of logic that differ inside a regex literal holding a `--`", () => {
    placesAt(
      scene(["P1.", "P2.", "P3.", "& local r = @/a--b/", "Shown.", "End."]),
      scene(["P1.", "P2.", "P3.", "& local r = @/a--c/", "& local r = @/a--b/", "Shown.", "End."]),
      3,
      { flow: "start", entry: 4 },
      ["Shown.", "End."],
    );
  });

  it("hold only the beats of the playthrough since the story was last reset", () => {
    const text = (withNew: boolean) =>
      [
        "store gold = 0",
        "",
        "scene old",
        "  Old one.",
        "  & gold = gold + 1",
        "  Old two.",
        "  Old three.",
        "end",
        "",
        ...(withNew ? ["scene new", "  New one.", "  New two.", "end", ""] : []),
      ].join("\n");
    const story = engine(rootOf(text(true)));
    story.ChoosePathString("old");
    expect(advance(story, 3)).toEqual(["Old one.", "Old two.", "Old three."]);
    story.ResetState();
    story.ChoosePathString("new");
    expect(advance(story, 1)).toEqual(["New one."]);
    const save = story.toSave();
    const flows = JSON.parse(save).beats.map((beat: any) => beat.position.st.levels[0].flow);
    expect(flows).not.toContain("old");
    const loaded = engine(rootOf(text(false)));
    let refused: unknown;
    try {
      loaded.loadSave(save);
    } catch (e) {
      refused = e;
    }
    expect(refused).toBeInstanceOf(SaveRefused);
    expect((refused as SaveRefused).flow).toBe("new");
  });

  it("keep the value of a global the release made a constant, whichever beat assigned it", () => {
    const before = scene(["First.", "& K = 2", "Second.", "Value {K}."], "start", ["store K = 1", ""]);
    const story = engine(rootOf(before));
    expect(advance(story, 2)).toEqual(["First.", "Second."]);
    const save = story.toSave();
    // The beat after the assignment wrote it as a change.
    expect(JSON.parse(save).beats.at(-1).globals).toHaveProperty("K");
    const loaded = engine(rootOf(scene(["First.", "Second.", "Value {K}."], "start", ["const K = 10", ""])));
    loaded.loadSave(save);
    expect(play(loaded).beats).toEqual(["Value 10."]);
  });

  // Round 2 of the review of #1654 (report 6038272271, finding 1): the
  // keyframe's value of the global defines the table another global holds.
  it("keep a table another global shares with a global the release made a constant, the keyframe its only definition", () => {
    const text = (k: string, assign: boolean) =>
      scene(
        [...(assign ? ["& K = { n = 1 }"] : []), "& alias = K", "First.", "Value {K} {alias.n}."],
        "start",
        [k, "store alias = nil", ""],
      );
    const story = engine(rootOf(text("store K = nil", true)), 1);
    expect(advance(story, 1)).toEqual(["First."]);
    const save = story.toSave();
    expect(JSON.parse(save).beats).toHaveLength(1);
    const loaded = engine(rootOf(text("const K = 10", false)));
    loaded.loadSave(save);
    expect(play(loaded).beats).toEqual(["Value 10 1."]);
  });
});

describe("a save that cannot be placed at its newest beat", () => {
  const TEXT = (deleted: boolean) =>
    [
      "store n = 0",
      "store t = { k = 0 }",
      "",
      "function tick()",
      "  return 0",
      "end",
      "",
      "-> start",
      "",
      "scene start",
      "  One {n}.",
      "  & n = n + 1",
      "  & t.k = t.k + 10",
      "  & tick()",
      "  Two {n} {t.k}.",
      "  & n = n + 1",
      "  & t.k = t.k + 10",
      "  & tick()",
      "  Three {n} {t.k}.",
      ...(deleted ? [] : ["  & n = n + 5"]),
      "  Four {n} {t.k}.",
      "end",
      "",
    ].join("\n");

  it("whose statement was deleted resumes at the newest earlier beat whose position is placed, with the variables, counts and tables that beat had", () => {
    const story = engine(rootOf(TEXT(false)));
    const state = (s: ProgramStory) => ({
      n: global(s, "n")?.toString(),
      k: (global(s, "t") as any).value.get("k").value,
      tick: countOf(s, "tick"),
    });
    expect(advance(story, 2)).toEqual(["One 0.", "Two 1 10."]);
    // The run stopped at the beat that the load falls back to.
    const atTwo = state(story);
    expect(atTwo).toEqual({ n: "1", k: 10, tick: 1 });
    expect(advance(story, 1)).toEqual(["Three 2 20."]);
    expect(state(story)).toEqual({ n: "2", k: 20, tick: 2 });
    // The newest beat stands at `& n = n + 5`, which is deleted.
    const save = story.toSave();
    const loaded = engine(rootOf(TEXT(true)));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(report.beats - 2);
    expect(report.exact).toBe(true);
    expect(state(loaded)).toEqual(atTwo);
    expect(shown(loaded)).toBe("Two 1 10.");
    expect(play(loaded).beats).toEqual(["Three 2 20.", "Four 2 20."]);
  });

  it("whose flow was deleted, with every beat of its history inside it, is refused and names the flow", () => {
    const story = engine(
      rootOf(scene(["L1.", "L2.", "L3.", "L4.", "L5."], "other")),
      3,
    );
    expect(advance(story, 4)).toHaveLength(4);
    const save = story.toSave();
    const levels = JSON.parse(save).beats.map(
      (beat: any) => beat.position.st.levels[0].flow,
    );
    expect(levels).toEqual(["other", "other", "other"]);
    const loaded = engine(rootOf(scene(["Something else."], "start")));
    const before = loaded.state.toJson();
    let refused: unknown;
    try {
      loaded.loadSave(save);
    } catch (e) {
      refused = e;
    }
    expect(refused).toBeInstanceOf(SaveRefused);
    expect((refused as SaveRefused).flow).toBe("other");
    expect(String(refused)).toMatch(/'other'/);
    expect(loaded.state.toJson()).toBe(before);
  });
});

describe("the stated limits of the alignment", () => {
  it("leaves a statement whose run stands twice in one sequence to an earlier beat, a tie", () => {
    const story = engine(rootOf(scene(["A.", "B.", "P.", "Q.", "R.", "C."])));
    expect(advance(story, 3)).toEqual(["A.", "B.", "P."]);
    const save = story.toSave();
    const loaded = engine(
      rootOf(
        scene(["A.", "B.", "C."]) +
          ["", "scene other", "  P.", "  Q.", "  R.", "  Z.", "  P.", "  Q.", "  R.", "end", ""].join("\n"),
      ),
    );
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    // "Q." and "P." tie; "B." is placed.
    expect(report.beat).toBe(report.beats - 3);
    expect(placed(loaded)).toEqual({ flow: "start", entry: 1 });
    expect(play(loaded).beats).toEqual(["B.", "C."]);
  });

  it("leaves a statement of a run of two moved statements, which is below the search's minimum, to an earlier beat", () => {
    const story = engine(rootOf(scene(["A.", "B.", "P.", "Q.", "C."])));
    expect(advance(story, 2)).toEqual(["A.", "B."]);
    const save = story.toSave();
    const loaded = engine(
      rootOf(
        scene(["A.", "B.", "C."]) +
          ["", "scene other", "  X.", "  P.", "  Q.", "  Y.", "end", ""].join("\n"),
      ),
    );
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(report.beats - 2);
    expect(placed(loaded)).toEqual({ flow: "start", entry: 1 });
    expect(play(loaded).beats).toEqual(["B.", "C."]);
  });

  // Section 8: the alignment keeps order, so a save taken at the second of
  // two identical lines resumes a line early after one was written between
  // them, and a line late after one was deleted.
  it("resumes inside a run of identical statements, or at the statement after it, at the ordinal the design gives and not the saved one", () => {
    const before = scene(["Intro.", "Same.", "Same.", "Same.", "End."]);
    const story = engine(rootOf(before));
    expect(advance(story, 2)).toEqual(["Intro.", "Same."]);
    const save = story.toSave();
    // The second "Same." is ordinal 2.
    expect(savedAt(save)).toEqual({ flow: "start", entry: 2 });
    const inserted = engine(rootOf(scene(["Above.", "Intro.", "Same.", "Same.", "Same.", "Same.", "End."])));
    inserted.loadSave(save);
    // The block `Intro. Same. Same. Same.` is matched one ordinal down, so
    // the save stands at the second of four, a line early.
    expect(placed(inserted)).toEqual({ flow: "start", entry: 3 });
    expect(play(inserted).beats).toEqual(["Same.", "Same.", "Same.", "End."]);
    const deleted = engine(rootOf(scene(["Above.", "Intro.", "Same.", "Same.", "End."])));
    deleted.loadSave(save);
    // The block `Intro. Same. Same.` is matched one ordinal down, so the
    // save stands at the second of two, a line late.
    expect(placed(deleted)).toEqual({ flow: "start", entry: 3 });
    expect(play(deleted).beats).toEqual(["Same.", "End."]);
  });
});

describe("a save at a menu", () => {
  const MENU = (edited: boolean) =>
    scene([
      "Before.",
      "choose",
      ...(edited ? ["  * [Banana]", "    Ate banana."] : []),
      "  * [Apple]",
      "    Ate apple.",
      edited ? "  * [Ripe pear]" : "  * [Pear]",
      "    Ate pear.",
      "end",
      "After.",
    ]);

  it("taken while choices are waiting, loaded after a choice's text was edited and a choice was added above it, presents the edited choices and continues from the chosen one", () => {
    const story = engine(rootOf(MENU(false)));
    expect(advance(story, 1)).toEqual(["Before."]);
    story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Apple", "Pear"]);
    const save = story.toSave();
    const loaded = engine(rootOf(MENU(true)));
    loaded.loadSave(save);
    expect(play(loaded, [2])).toEqual({
      beats: ["Ate pear.", "After."],
      menus: [["Banana", "Apple", "Ripe pear"]],
    });
  });

  it("holding a choice a thread raised before its beat, places that choice by its part after its text was edited and a choice was added above it", () => {
    const THREADS = (edited: boolean) =>
      [
        "-> hub",
        "scene hub",
        "  You arrive.",
        "  <- merchant",
        "  <- guard",
        "  choose",
        '    * "Leave"',
        "      fin",
        "  end",
        "end",
        "scene merchant",
        "  choose",
        // A choice added above the edited one, with one that is unchanged
        // between them: an insertion beside the edited part would pair the
        // two the wrong way round, the stated limit of section 2.
        ...(edited ? ['    * "Hello?"', "      Hello.", "      fin"] : []),
        '    * "Keep"',
        "      Kept.",
        "      fin",
        edited ? '    * "What do you sell now?"' : '    * "What do you sell?"',
        "      Nothing much.",
        "      fin",
        "  end",
        "  done",
        "end",
        "scene guard",
        "  The guard nods.",
        "  choose",
        '    * "News"',
        "      None.",
        "      fin",
        "  end",
        "  done",
        "end",
        "",
      ].join("\n");
    const story = engine(rootOf(THREADS(false)));
    while (story.canContinue) story.Continue();
    const save = story.toSave();
    // The merchant's choices were raised before the guard's line.
    expect(JSON.parse(save).beats.at(-1).choices.map((c: { text: string }) => c.text)).toEqual([
      '"Keep"',
      '"What do you sell?"',
    ]);
    const loaded = engine(rootOf(THREADS(true)));
    loaded.loadSave(save);
    while (loaded.canContinue) loaded.Continue();
    const texts = loaded.currentChoices.map((c) => c.text);
    // The held choice keeps the text it was raised with.
    const held = texts.indexOf('"What do you sell?"');
    expect(held).toBeGreaterThanOrEqual(0);
    loaded.ChooseChoiceIndex(held);
    // Its entry is the edited part's, which echoes the part's line as the
    // program writes it now.
    expect(play(loaded).beats).toEqual(['"What do you sell now?"', "Nothing much."]);
  });

  describe("taken after a choice was made", () => {
    const CHOSEN = (pear: "kept" | "gone" | "hidden") =>
      scene(
        [
          "Before.",
          "choose",
          "  * [Apple]",
          "    Ate apple.",
          ...(pear === "gone" ? [] : ["  * if OK [Pear]", "    Ate pear."]),
          "end",
          "After.",
        ],
        "start",
        [`const OK = ${pear === "hidden" ? "false" : "true"}`, ""],
      );

    // A save after the choice, from `toSave`, or, as a game exports a
    // checkpoint it took right after the choice, from the image
    // `captureBeat` gives (round 1 of the review of #1654, report
    // 6031317072).
    const chosenSave = (from: "save" | "checkpoint" = "save") => {
      const story = engine(rootOf(CHOSEN("kept")));
      expect(advance(story, 1)).toEqual(["Before."]);
      story.Continue();
      expect(story.currentChoices.map((c) => c.text)).toEqual(["Apple", "Pear"]);
      story.ChooseChoiceIndex(1);
      const save = from === "save" ? story.toSave() : story.saveOfImage(story.captureBeat())!;
      // The menu's beat, with the choice in the saved form of its part.
      expect(JSON.parse(save).chosen.a.ch[2]).toBe(1);
      return save;
    };

    it("takes the choice again", () => {
      const loaded = engine(rootOf(CHOSEN("kept")));
      loaded.loadSave(chosenSave());
      expect(loaded.loadedSaveReport!.chosen).toBe("taken");
      expect(play(loaded).beats).toEqual(["Ate pear.", "After."]);
    });

    it("is unplaced when the chosen part is gone, and stays at the menu", () => {
      const loaded = engine(rootOf(CHOSEN("gone")));
      loaded.loadSave(chosenSave());
      expect(loaded.loadedSaveReport!.chosen).toBe("unplaced");
      expect(loaded.loadedSaveReport!.exact).toBe(true);
      expect(play(loaded, [0])).toEqual({ beats: ["Ate apple.", "After."], menus: [["Apple"]] });
    });

    it("is unplaced when its condition no longer offers it, and stays at the menu", () => {
      const loaded = engine(rootOf(CHOSEN("hidden")));
      loaded.loadSave(chosenSave());
      expect(loaded.loadedSaveReport!.chosen).toBe("unplaced");
      expect(play(loaded, [0])).toEqual({ beats: ["Ate apple.", "After."], menus: [["Apple"]] });
    });

    // A stop at a breakpoint or at the execution step ceiling part way
    // through the chosen part's first line is still a save after the choice
    // (#1693; round 1 of the review of #1696, report 6059804803).
    it("taken while the chosen part's first line is in progress, is the menu's beat with the choice", () => {
      const pausedAfterPear = () => {
        const story = engine(rootOf(CHOSEN("kept")));
        expect(advance(story, 1)).toEqual(["Before."]);
        story.Continue();
        story.ChooseChoiceIndex(1);
        story.ContinueAsync();
        expect(story.asyncContinueComplete).toBe(false);
        return story;
      };
      const rest = (story: ProgramStory) => {
        story.Continue();
        return [shown(story), ...play(story).beats];
      };
      const story = pausedAfterPear();
      const save = story.toSave();
      expect(JSON.parse(save).chosen.a.ch[2]).toBe(1);
      // The line finishes as it does when nothing saved.
      expect(story.asyncContinueComplete).toBe(false);
      const after = rest(story);
      expect(after).toEqual(rest(pausedAfterPear()));
      // The choice's entry ends an empty line before its body's.
      expect(after).toEqual(["", "Ate pear.", "After."]);

      const kept = engine(rootOf(CHOSEN("kept")));
      kept.loadSave(save);
      expect(kept.loadedSaveReport!.chosen).toBe("taken");
      expect(play(kept).beats).toEqual(["Ate pear.", "After."]);

      const hidden = engine(rootOf(CHOSEN("hidden")));
      hidden.loadSave(save);
      expect(hidden.loadedSaveReport!.chosen).toBe("unplaced");
      expect(play(hidden, [0])).toEqual({ beats: ["Ate apple.", "After."], menus: [["Apple"]] });
    });

    it("and a jump elsewhere before the next beat is a save of the state as it stands, with no choice to take again", () => {
      const story = engine(rootOf(CHOSEN("kept")));
      advance(story, 1);
      story.Continue();
      story.ChooseChoiceIndex(1);
      story.ChoosePathString("start");
      const save = story.toSave();
      expect(JSON.parse(save).chosen).toBeUndefined();
      const loaded = engine(rootOf(CHOSEN("kept")));
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.chosen).toBeNull();
      expect(advance(loaded, 1)).toEqual(["Before."]);
    });

    // Round 2 of the review of #1654 (report 6038272271, a concern the
    // reviewer left unverified).
    it("and a callstack reset before the next beat is a save of the ended story, with no choice to take again", () => {
      const story = engine(rootOf(CHOSEN("kept")));
      advance(story, 1);
      story.Continue();
      story.ChooseChoiceIndex(1);
      story.ResetCallstack();
      expect(story.canContinue).toBe(false);
      const save = story.toSave();
      expect(JSON.parse(save).chosen).toBeUndefined();
      const loaded = engine(rootOf(CHOSEN("kept")));
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.chosen).toBeNull();
      expect(play(loaded).beats).toEqual([]);
    });

    it("as a checkpoint's image exported, takes the choice again, and is unplaced when its condition no longer offers it", () => {
      const same = engine(rootOf(CHOSEN("kept")));
      same.loadSave(chosenSave("checkpoint"));
      expect(same.loadedSaveReport!.chosen).toBe("taken");
      expect(play(same).beats).toEqual(["Ate pear.", "After."]);
      const hidden = engine(rootOf(CHOSEN("hidden")));
      hidden.loadSave(chosenSave("checkpoint"));
      expect(hidden.loadedSaveReport!.chosen).toBe("unplaced");
      expect(play(hidden, [0])).toEqual({ beats: ["Ate apple.", "After."], menus: [["Apple"]] });
    });

    // Round 2 of the review of #1654 (report 6032759458, finding 3).
    it("as a checkpoint taken after the choice, restored and then saved, takes the choice again or is unplaced as a save just after the choice is", () => {
      const story = engine(rootOf(CHOSEN("kept")));
      expect(advance(story, 1)).toEqual(["Before."]);
      story.Continue();
      story.ChooseChoiceIndex(1);
      const checkpoint = story.captureBeat();
      expect(advance(story, 2)).toEqual(["Ate pear.", "After."]);
      expect(story.restore(checkpoint)).toBe(true);
      const save = story.toSave();
      const hidden = engine(rootOf(CHOSEN("hidden")));
      hidden.loadSave(save);
      expect(hidden.loadedSaveReport!.chosen).toBe("unplaced");
      expect(play(hidden, [0])).toEqual({ beats: ["Ate apple.", "After."], menus: [["Apple"]] });
      expect(JSON.parse(save).chosen?.a?.ch?.[2]).toBe(1);
      const same = engine(rootOf(CHOSEN("kept")));
      same.loadSave(save);
      expect(same.loadedSaveReport!.chosen).toBe("taken");
      expect(play(same).beats).toEqual(["Ate pear.", "After."]);
      // Run on from the restored checkpoint, the story saves the beat it
      // reached, with no choice.
      expect(advance(story, 1)).toEqual(["Ate pear."]);
      expect(JSON.parse(story.toSave()).chosen).toBeUndefined();
    });

    // Round 2 of the review of #1654 (report 6038272271, finding 2).
    it("as a checkpoint taken after the choice, exported or restored and saved by the engine of a compile that emitted the menu again, takes the choice again", () => {
      const s = programSession(CHOSEN("kept"));
      const story = new ProgramStory(s.root);
      story.keepBeatImages = true;
      story.onError = () => {};
      expect(advance(story, 1)).toEqual(["Before."]);
      story.Continue();
      story.ChooseChoiceIndex(1);
      const checkpoint = story.captureBeat();
      // A choice inserted above the menu's first: the menu's chunk is
      // emitted again, and Pear is its third choice.
      const edited = s.edit("    * [Apple]", "    * [Banana]\n      Ate banana.\n    * [Apple]");
      expect(edited.position(chunkOfAddress(checkpoint.afterChoice!.address))).toBeUndefined();
      const next = new ProgramStory(edited, { images: story.images, history: story.history });
      next.keepBeatImages = true;
      next.onError = () => {};
      const exported = next.saveOfImage(checkpoint)!;
      expect(next.restore(checkpoint)).toBe(true);
      const saved = next.toSave();
      for (const save of [exported, saved]) {
        expect(JSON.parse(save).chosen?.a?.ch?.[2]).toBe(2);
        const loaded = engine(edited);
        loaded.loadSave(save);
        expect(loaded.loadedSaveReport!.chosen).toBe("taken");
        expect(play(loaded).beats).toEqual(["Ate pear.", "After."]);
      }
      // The decision the menu's beat records, handed on with the history,
      // names the choice in the new program too.
      expect(JSON.parse(saved).beats.at(-1).decisions.map((d: any) => d.a.ch[2])).toEqual([2]);
    });
  });
});

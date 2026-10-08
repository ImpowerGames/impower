// Addresses and source locations on the binary program (#700): the root's two
// lookups, `addressAt` and `locationOf` (docs/engine/binary-program.md,
// section 8). A beat is known by the offset of its `LineStart`, so every line
// of one beat gives one address and the lines of two beats give two; a
// chunk's line rows count from its statement's first line, or from the end of
// the body they stand below, and where a body starts is the root's to derive,
// so an edit above a statement changes neither its chunk nor its line table
// and `locationOf` of its address moves with the lines inserted.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { Op } from "../../program/ProgramInstructions";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import {
  blockCount,
  chunkId,
  chunkOfAddress,
  offsetOfAddress,
  type StatementChunk,
} from "../../program/StatementChunk";
import {
  MAIN_URI,
  compileScript,
  programCompiler,
  programSession,
  storyBeats,
} from "./programHarness";

const quiet = <T>(run: () => T): T => {
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
  const { program } = quiet(() => compileScript(text));
  if (!program.chunks) {
    throw new Error(`falls back: ${JSON.stringify(program.fallback)}`);
  }
  return program.chunks;
};

/** The line of `text` that holds `needle`, counting from 0. */
const lineOf = (text: string, needle: string): number => {
  const line = text.split("\n").findIndex((l) => l.includes(needle));
  if (line < 0) {
    throw new Error(`No line holds ${JSON.stringify(needle)}.`);
  }
  return line;
};

/** The chunk an address names, with the instruction at its offset. */
const at = (root: ProgramRoot, address: number) => {
  const position = root.position(chunkOfAddress(address))!;
  const chunk = position.sequence.arrays.chunks[position.entry]!;
  const offset = offsetOfAddress(address);
  return {
    position,
    chunk,
    op: BinaryProgramReader.instructionAt(chunk, offset).op,
  };
};

/** Every chunk a root holds, flow after flow, bodies after their owner. */
const chunksOf = (root: ProgramRoot): StatementChunk[] => {
  const out: StatementChunk[] = [];
  const walk = (row: SequenceRow | undefined) => {
    for (const chunk of row?.arrays.chunks ?? []) {
      out.push(chunk);
      for (let k = 0; k < blockCount(chunk); k += 1) {
        walk(root.body(chunk, k));
      }
    }
  };
  root.flowSequences().forEach(walk);
  return out;
};

describe("the address of a beat", () => {
  const text = [
    "scene A",
    "  RAFFLES:",
    "    [[raffles_concerned:gloves]]",
    "    (searching his face)",
    "    _Do you understand_?",
    "",
    "  Bunny waits.",
    "  Three > Four.",
    "end",
    "",
  ].join("\n");
  const root = rootOf(text);

  it("is one address for the cue line, the directive and the dialogue text, the offset of the beat's LineStart", () => {
    const lines = [
      "RAFFLES:",
      "[[raffles_concerned:gloves]]",
      "(searching his face)",
      "_Do you understand_?",
    ].map((needle) => root.addressAt(MAIN_URI, lineOf(text, needle)));
    expect(new Set(lines).size).toBe(1);
    const address = lines[0]!;
    expect(at(root, address).op).toBe(Op.LineStart);
    // What a story stopped at that address shows is that beat.
    const story = new ProgramStory(root);
    story.ChooseAddress(address);
    expect(story.Continue()).toContain("Do you understand");
  });

  it("is another for the next beat, and one each for two beats a `>` breaks a line into", () => {
    const dialogue = root.addressAt(MAIN_URI, lineOf(text, "RAFFLES:"))!;
    const bunny = root.addressAt(MAIN_URI, lineOf(text, "Bunny waits."))!;
    const three = lineOf(text, "Three > Four.");
    const first = root.addressAt(MAIN_URI, three)!;
    const last = root.addressAt(MAIN_URI, three, { beat: "last" })!;
    expect(new Set([dialogue, bunny, first, last]).size).toBe(4);
    for (const address of [bunny, first, last]) {
      expect(at(root, address).op).toBe(Op.LineStart);
    }
    // The two beats of one line are one statement's.
    expect(chunkOfAddress(first)).toBe(chunkOfAddress(last));
    expect(offsetOfAddress(first)).toBeLessThan(offsetOfAddress(last));
    expect(root.locationOf(first)).toMatchObject({ uri: MAIN_URI, startLine: three });
    expect(root.locationOf(last)).toMatchObject({ uri: MAIN_URI, startLine: three });
  });

  it("is the next beat's for a blank line, and nothing past the last statement", () => {
    expect(root.addressAt(MAIN_URI, lineOf(text, "_Do you") + 1)).toBe(
      root.addressAt(MAIN_URI, lineOf(text, "_Do you")),
    );
    expect(root.addressAt(MAIN_URI, lineOf(text, "end"))).toBeUndefined();
  });

  it("is where the address's location says the beat is", () => {
    const address = root.addressAt(MAIN_URI, lineOf(text, "Bunny waits."))!;
    expect(root.locationOf(address)).toEqual({
      uri: MAIN_URI,
      startLine: lineOf(text, "Bunny waits."),
      startColumn: 0,
      endLine: lineOf(text, "Bunny waits."),
      endColumn: "  Bunny waits.".length,
    });
    expect(root.locationOf(address + 2 ** 21 * 1000)).toBeUndefined();
  });

  // A dialogue block's range takes its last line's break, so it ends at the
  // start of the line below. Its location ends with the line before, on the
  // line the current engine's ends on, which is the line a reader of a
  // location's end (the preview's executed-line label and ranges, the
  // editor's selection after STOP) shows (#703).
  it("ends on the line the current engine's location of the line ends on", () => {
    const current = programLocator(quiet(() => compileScript(text)).program);
    const lines = text.split("\n").length;
    const program = programLocator(quiet(() => compileScript(text)).program);
    const ends = (locator: typeof current) =>
      Array.from({ length: lines }, (_, line) => {
        const address = locator.addressAt(MAIN_URI, line, { beat: "last" });
        const location = address == null ? undefined : locator.locationOf(address);
        return location ? [location.endLine, location.endColumn] : null;
      });
    const first = lineOf(text, "RAFFLES:");
    const last = lineOf(text, "Three > Four.");
    // The scene's header is the program engine's first beat (section 8),
    // so the lines compared are the beats'.
    expect(ends(program).slice(first, last + 1)).toEqual(ends(current).slice(first, last + 1));
    const dialogue = root.addressAt(MAIN_URI, lineOf(text, "_Do you understand_?"))!;
    expect(root.locationOf(dialogue)?.endLine).toBe(lineOf(text, "_Do you understand_?") + 1);
  });

  // The same inside the bodies of a block statement and after them, whose
  // source has its bodies cut out, with the script's lines ended by CRLF.
  it("ends on the current engine's line inside and after a block's bodies", () => {
    const blockText = [
      "store x = true",
      "scene A",
      "  if x then",
      "    HERO:",
      "      Inside the branch.",
      "",
      "  else",
      "    HERO:",
      "      Inside the other.",
      "",
      "  end",
      "  HERO:",
      "    After the block.",
      "",
      "  The end.",
      "end",
      "",
    ].join("\r\n");
    const current = programLocator(quiet(() => compileScript(blockText)).program);
    const program = programLocator(
      quiet(() => compileScript(blockText)).program,
    );
    const end = (locator: typeof current, needle: string) => {
      const address = locator.addressAt(MAIN_URI, lineOf(blockText, needle), { beat: "last" });
      const location = address == null ? undefined : locator.locationOf(address);
      return location ? [location.endLine, location.endColumn] : null;
    };
    for (const needle of ["Inside the branch.", "Inside the other.", "After the block.", "The end."]) {
      expect(end(program, needle), needle).toEqual(end(current, needle));
    }
  });
});

describe("an edit above a statement", () => {
  const text = [
    "store x = true",
    "",
    "scene A",
    "  Before.",
    "  if x then",
    "    One.",
    "    if x then",
    "      Inner.",
    "    end",
    "    Below inner.",
    "  else",
    "    Two.",
    "  end",
    "  After.",
    "end",
    "",
    "scene B",
    "  Bee.",
    "end",
    "",
  ].join("\n");

  // Inserting `inserted` lines with the edit leaves every chunk of the root
  // before it, and every line table with it, the same object beside the new
  // ones, and moves the location of each address below the edit by the
  // lines inserted.
  const expectMoved = (
    edit: (s: ReturnType<typeof programSession>) => ProgramRoot,
    watched: string[],
    inserted: number,
  ) => {
    const s = quiet(() => programSession(text));
    const before = s.root;
    const addresses = watched.map((needle) => before.addressAt(MAIN_URI, lineOf(text, needle))!);
    const locations = addresses.map((address) => before.locationOf(address)!);
    const after = edit(s);
    const kept = new Set(chunksOf(after));
    const added = chunksOf(after).filter((chunk) => !chunksOf(before).includes(chunk));
    // Each inserted line is a statement of its own.
    expect(added).toHaveLength(inserted);
    for (const chunk of chunksOf(before)) {
      expect(kept.has(chunk), `chunk ${chunkId(chunk)} is kept`).toBe(true);
    }
    addresses.forEach((address, i) => {
      expect(after.locationOf(address), watched[i]).toEqual({
        ...locations[i],
        startLine: locations[i]!.startLine + inserted,
        endLine: locations[i]!.endLine + inserted,
      });
    });
    return { before, after, addresses };
  };

  it("at the top level moves every address below it, and changes no chunk", () => {
    expectMoved(
      (s) => s.edit("  Before.", "  Before.\n  Also before.\n  And again."),
      ["One.", "Inner.", "Below inner.", "Two.", "After.", "Bee."],
      2,
    );
  });

  it("inside a nested block moves the addresses below it, in the enclosing bodies too", () => {
    expectMoved(
      (s) => s.edit("      Inner.", "      Inner.\n      Inner too."),
      ["Below inner.", "Two.", "After.", "Bee."],
      1,
    );
  });

  it("inside the first branch of an `if` moves its `else` branch, whose sequence and row are the same objects", () => {
    const { before, after, addresses } = expectMoved(
      (s) => s.edit("    One.", "    One.\n    One and a half."),
      ["Two."],
      1,
    );
    const was = before.position(chunkOfAddress(addresses[0]!))!.sequence;
    const now = after.position(chunkOfAddress(addresses[0]!))!.sequence;
    expect(now).toBe(was);
    expect(now.arrays).toBe(was.arrays);
    expect(after.sequence(was.id)).toBe(before.sequence(was.id));
    // The owner is the same chunk, and its line table the same words.
    const owner = (root: ProgramRoot) => {
      const position = root.position(was.owner)!;
      return position.sequence.arrays.chunks[position.entry]!;
    };
    expect(owner(after)).toBe(owner(before));
    expect(after.firstLineOf(now)).toBe(before.firstLineOf(was) + 1);
  });
});

describe("a part of a block statement below one of its bodies", () => {
  const text = [
    "store x = 1",
    "",
    "scene A",
    "  if x == 1 then",
    "    One.",
    "  elseif x == 2 then",
    "    Two.",
    "  end",
    "  choose",
    "    Hi.",
    "    + A",
    "      a.",
    "    + B",
    "      b.",
    "  then (after)",
    "    c.",
    "  end",
    "end",
    "",
  ].join("\n");

  // Each part's address before and after an edit inside the body above it:
  // the owner's chunk is the same object, and the part reports its new line.
  const cases: { part: string; edit: [string, string] }[] = [
    { part: "elseif x == 2 then", edit: ["    One.", "    One.\n    One more."] },
    { part: "+ B", edit: ["      a.", "      a.\n      a again."] },
    { part: "then (after)", edit: ["      b.", "      b.\n      b again."] },
  ];

  for (const { part, edit } of cases) {
    it(`(${part}) reports its new line after an edit inside that body, with the owner's chunk unchanged`, () => {
      const s = quiet(() => programSession(text));
      const before = s.root;
      const line = lineOf(text, part);
      const address = before.addressAt(MAIN_URI, line)!;
      expect(before.locationOf(address)).toMatchObject({ uri: MAIN_URI, startLine: line });
      const owner = at(before, address).chunk;
      // An address inside the owner's own code, not one of its bodies'.
      expect(blockCount(owner)).toBeGreaterThan(0);
      const after = s.edit(...edit);
      expect(at(after, address).chunk).toBe(owner);
      expect(after.locationOf(address)).toMatchObject({
        uri: MAIN_URI,
        startLine: line + 1,
        endLine: line + 1,
      });
      expect(after.addressAt(MAIN_URI, line + 1)).toBe(address);
    });
  }

  it("the `then` label's definition stands on its line", () => {
    const root = rootOf(text);
    const symbol = root.table.symbolIds.get("A.after")!;
    const definition = root.definition(symbol)!;
    const row = root.sequence(definition.sequence)!;
    const chunk = row.arrays.chunks[definition.entry]!;
    expect(root.locationOf(chunkId(chunk) * 2 ** 21 + definition.offset)).toMatchObject({
      startLine: lineOf(text, "then (after)"),
    });
  });
});

describe("two scripts with a statement on the same line", () => {
  const MAIN = "file://proj/main.sd";
  const CHAPTER = "file://proj/chapter.sd";
  const texts = {
    [MAIN]: ["include chapter.sd", "", "scene A", "  Raffles waits.", "  -> B", "end", ""].join("\n"),
    [CHAPTER]: ["", "", "scene B", "  Bunny arrives.", "end", "", "scene C", "  Later.", "end", ""].join("\n"),
  };
  const { program } = quiet(() =>
    programCompiler(texts).compile(MAIN),
  );
  const root = program.chunks!;

  it("compiles to statement chunks", () => {
    expect(program.chunks).toBeDefined();
    expect(root).toBeDefined();
  });

  it("gives two addresses for line 3, and each its own script back", () => {
    const inMain = root.addressAt(MAIN, 3)!;
    const inChapter = root.addressAt(CHAPTER, 3)!;
    expect(inMain).not.toBe(inChapter);
    expect(root.locationOf(inMain)).toMatchObject({ uri: MAIN, startLine: 3 });
    expect(root.locationOf(inChapter)).toMatchObject({ uri: CHAPTER, startLine: 3 });
    const story = new ProgramStory(root);
    story.ChooseAddress(inChapter);
    expect(story.Continue()).toBe("Bunny arrives.\n");
  });

  it("holds each flow's script and first line, and each script's flows in line order", () => {
    const flows = (uri: string) =>
      root.flows(uri).map((row) => [root.table.symbols[row.flow], row.uri, root.firstLineOf(row)]);
    expect(flows(CHAPTER)).toEqual([
      ["B", CHAPTER, 3],
      ["C", CHAPTER, 7],
    ]);
    expect(flows(MAIN).filter(([name]) => name !== "")).toEqual([["A", MAIN, 3]]);
  });

  it("names the scene each address stands in", () => {
    expect(root.sceneAt(root.addressAt(MAIN, 3)!)).toBe("A");
    expect(root.sceneAt(root.addressAt(CHAPTER, 7)!)).toBe("C");
  });

  it("runs the same beats from either script's flows", () => {
    expect(storyBeats(new ProgramStory(root), "A").beats.map((b) => b.text)).toEqual([
      "Raffles waits.\n",
      "Bunny arrives.\n",
    ]);
  });
});

// Round 1 of the review of #1618 (report 6026971997): a suspended thread's
// frames return too. A tunnel into B forks C, which leaves its inherited
// tunnel onward into D; D's `done` resumes B, which returns through the
// tunnel into A, so while D runs, A's return is one the story comes back to.
describe("the addresses a story will come back to", () => {
  const TEXT = [
    "-> A",
    "",
    "scene A",
    "  Before the tunnel.",
    "  -> B ->",
    "  After the tunnel.",
    "  done",
    "end",
    "",
    "scene B",
    "  In B.",
    "  <- C",
    "  ->->",
    "end",
    "",
    "scene C",
    "  In C.",
    "  ->-> D",
    "end",
    "",
    "scene D",
    "  In D.",
    "  done",
    "end",
    "",
  ].join("\n");

  it("include the returns of a suspended thread's frames", () => {
    const root = rootOf(TEXT);
    const story = new ProgramStory(root);
    const scenesBack: Record<string, string[]> = {};
    const texts: string[] = [];
    story.ChoosePathString("A");
    while (story.canContinue) {
      const text = quiet(() => story.Continue()) ?? "";
      texts.push(text);
      scenesBack[text.trim()] = story
        .stackAddresses()
        .map((address) => root.sceneAt(address) ?? "");
    }
    expect(texts.map((t) => t.trim()).filter(Boolean)).toEqual([
      "Before the tunnel.",
      "In B.",
      "In C.",
      "In D.",
      "After the tunnel.",
    ]);
    // While D runs, the suspended thread stands in B and its tunnel frame
    // returns into A.
    expect(scenesBack["In D."]).toEqual(expect.arrayContaining(["A", "B"]));
  });
});

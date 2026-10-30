import { afterEach, describe, expect, it, vi } from "vitest";
import { programLocator } from "../../compiler/utils/programLocator";
import { MAIN_URI, programCompiler } from "./programHarness";

const TEXT = [
  "store trust = 0",
  "",
  "scene MAIN",
  "  [[raffles_concerned]] Raffles waits by the door.",
  "  & trust = trust + 1",
  "  if trust > 0 then",
  "    ((door_creak)) Bunny arrives.",
  "  end",
  "  The door closes.",
  "  -> ELSEWHERE",
  "end",
  "",
  "scene ELSEWHERE",
  "  [[street]] A street at night.",
  "end",
  "",
].join("\n");

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

function editInsideOneBeat() {
  const c = programCompiler({ [MAIN_URI]: TEXT }, {
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
  } as never);
  c.compiler.profilerId = "700";
  const measure = vi.spyOn(performance, "measure");
  const first = quiet(() => c.compile()).program;
  const before = measure.mock.calls.length;
  const find = "Raffles waits by the door.";
  const offset = TEXT.indexOf(find);
  const line = TEXT.slice(0, offset).split("\n").length - 1;
  const character = offset - TEXT.lastIndexOf("\n", offset) - 1 + find.length - 1;
  quiet(() =>
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character },
          },
          text: " quietly",
        },
      ],
    } as never),
  );
  const edited = quiet(() => c.compile()).program;
  const phases = measure.mock.calls
    .slice(before)
    .map(([name]) => String(name));
  measure.mockRestore();
  return { first, edited, phases };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a compile with statement chunks", () => {
  it("runs neither populateLocations nor sortPathLocations for an edit inside one beat", () => {
    const { first, edited, phases } = editInsideOneBeat();
    expect(first.chunks).toBeDefined();
    expect(edited.chunks).toBeDefined();
    expect(phases.some((name) => name.includes("program/chunks"))).toBe(true);
    expect(phases.filter((name) => /populateLocations|sortPathLocations/.test(name))).toEqual([]);
    const locator = programLocator(edited);
    const address = locator.addressAt(MAIN_URI, 3)!;
    expect(locator.locationOf(address)).toMatchObject({ uri: MAIN_URI, startLine: 3 });
  });

  it("reads its scene assets from its chunks, each beat at its LineStart's address", () => {
    const c = programCompiler({ [MAIN_URI]: TEXT }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    const assets = program.sceneAssets!;
    const locator = programLocator(program);
    expect(assets["MAIN"]).toMatchObject({
      kind: "scene",
      image: ["raffles_concerned"],
      audio: ["door_creak"],
      successors: ["ELSEWHERE"],
    });
    expect(assets["ELSEWHERE"]).toMatchObject({ image: ["street"] });
    const beats = assets["MAIN"]!.beats;
    expect(beats.map((beat) => locator.locationOf(beat.address)?.startLine)).toEqual([3, 6]);
    expect(beats[0]!.address).toBe(locator.addressAt(MAIN_URI, 3));
    expect(beats[1]!.address).toBe(locator.addressAt(MAIN_URI, 6));
  });

  it("reads a choice's entry and its body before the next choice's, in document order", () => {
    const text = [
      "",
      "",
      "scene MAIN",
      "  [[intro]] Intro.",
      "  choose",
      "    + [A] [[option_a]] A.",
      "      [[body_a]] Body A.",
      "    + [B] [[option_b]] B.",
      "      [[body_b]] Body B.",
      "  end",
      "  [[outro]] Outro.",
      "end",
      "scene start",
      "  -> MAIN",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    expect(program.chunks).toBeDefined();
    const images = program.sceneAssets!["MAIN"]!.beats.flatMap((beat) => beat.image ?? []);
    expect(images).toEqual(["intro", "option_a", "body_a", "option_b", "body_b", "outro"]);
  });

  it("reads a nested choose block's then clause before the next choice of the block around it", () => {
    const text = [
      "",
      "",
      "scene MAIN",
      "  choose",
      "    choose",
      "      + [A]",
      "        [[body_a]] A.",
      "    then",
      "      [[join_a]] Joined A.",
      "    end",
      "    + [B]",
      "      [[body_b]] B.",
      "  then",
      "    [[finished]] Finished.",
      "  end",
      "end",
      "scene start",
      "  -> MAIN",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    expect(program.chunks).toBeDefined();
    const locator = programLocator(program);
    const beats = program.sceneAssets!["MAIN"]!.beats;
    expect(beats.flatMap((beat) => beat.image ?? [])).toEqual([
      "body_a",
      "join_a",
      "body_b",
      "finished",
    ]);
    expect(beats.map((beat) => locator.locationOf(beat.address)?.startLine)).toEqual([
      6, 8, 11, 13,
    ]);
  });

  it("reads a choose block's bodies, its then clause and the content after it in document order", () => {
    const text = [
      "",
      "",
      "scene MAIN",
      "  [[intro]] Intro.",
      "  choose",
      "    + [A] [[option_a]] A.",
      "      [[body_a]] Body A.",
      "    + [B] [[option_b]] B.",
      "      [[body_b]] Body B.",
      "  then",
      "    [[joined]] Joined.",
      "  end",
      "  [[outro]] Outro.",
      "end",
      "scene start",
      "  -> MAIN",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    const images = program.sceneAssets!["MAIN"]!.beats.flatMap((beat) => beat.image ?? []);
    expect(images).toEqual([
      "intro",
      "option_a",
      "body_a",
      "option_b",
      "body_b",
      "joined",
      "outro",
    ]);
  });

  it("reads a choose block nested in a choice's body before the next choice", () => {
    const text = [
      "",
      "",
      "scene MAIN",
      "  [[intro]] Intro.",
      "  choose",
      "    + [A] [[option_a]] A.",
      "      choose",
      "        + [A1] [[option_a1]] A1.",
      "          [[body_a1]] Body A1.",
      "        + [A2] [[option_a2]] A2.",
      "      end",
      "      [[after_a]] After A.",
      "    + [B] [[option_b]] B.",
      "  end",
      "  [[outro]] Outro.",
      "end",
      "scene start",
      "  -> MAIN",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    const images = program.sceneAssets!["MAIN"]!.beats.flatMap((beat) => beat.image ?? []);
    expect(images).toEqual([
      "intro",
      "option_a",
      "option_a1",
      "body_a1",
      "option_a2",
      "after_a",
      "option_b",
      "outro",
    ]);
  });

  it("names one record for a beat whose text an interpolation splits", () => {
    const text = [
      "store score = 0",
      "",
      "",
      "",
      "scene MAIN",
      "  [[room]] Hello {score} [[portrait]] and [[room]] again.",
      "  [[street]] Later.",
      "end",
      "scene start",
      "  -> MAIN",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, {
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
    } as never);
    const program = quiet(() => c.compile()).program;
    expect(program.chunks).toBeDefined();
    const locator = programLocator(program);
    const beats = program.sceneAssets!["MAIN"]!.beats;
    expect(beats.map((beat) => beat.image)).toEqual([["room", "portrait"], ["street"]]);
    expect(beats.map((beat) => beat.address)).toEqual([
      locator.addressAt(MAIN_URI, 5),
      locator.addressAt(MAIN_URI, 6),
    ]);
  });
});

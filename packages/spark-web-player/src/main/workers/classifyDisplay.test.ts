// Whether a display can put the page in its frame in place, from the
// programs a compiler makes of a script and its edits (#657).
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it } from "vitest";
import { classifyDisplay, type ShownDisplay } from "./classifyDisplay";

const MAIN = "file:///local/main.sd";

const SCRIPT = `-> start

scene start
  HERO:
    The first line.

  HERO:
    The second line.
end

scene other
  OTHER:
    Another scene's line.
end
`;

const lineOf = (text: string, find: string) =>
  text.split("\n").findIndex((l) => l.includes(find));
const SECOND = lineOf(SCRIPT, "The second line.");

/** A compiler holding `SCRIPT`, configured as the player's worker
 *  configures its own, and the programs it compiles of it as it is edited,
 *  each measured against the one before. */
function compiling() {
  const compiler = new SparkdownCompiler();
  compiler.configure({ seedBuiltinsIntoStory: true } as any);
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: SCRIPT, version: 1, languageId: "sparkdown" },
    ],
  });
  let text = SCRIPT;
  let version = 1;
  const compile = () => compiler.compile({ textDocument: { uri: MAIN } }).program;
  return {
    first: compile(),
    /** Replace `find` with `replace`, and compile. */
    edit(find: string, replace: string): SparkProgram {
      const offset = text.indexOf(find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const at = (o: number) => {
        const before = text.slice(0, o).split("\n");
        return { line: before.length - 1, character: before.at(-1)!.length };
      };
      compiler.updateDocument({
        textDocument: { uri: MAIN, version: ++version },
        contentChanges: [{ range: { start: at(offset), end: at(offset + find.length) }, text: replace }],
      } as any);
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      return compile();
    },
  };
}

const shown = (program: SparkProgram, over: Partial<ShownDisplay> = {}): ShownDisplay => ({
  program,
  speculative: false,
  file: MAIN,
  line: SECOND,
  definesContextBuilds: 1,
  ...over,
});

/** An application the game displayed to, and a checkpoint that loads. */
const LOADED = { fresh: false, checkpointLoads: true };

describe("classifyDisplay", () => {
  it("puts an edit of the cursor's line in place", () => {
    const c = compiling();
    const next = c.edit("The second line.", "The second line, edited.");
    expect(classifyDisplay(shown(c.first), shown(next), LOADED)).toEqual({ inPlace: true });
  });

  it("puts the same program at the same line in place", () => {
    const c = compiling();
    expect(classifyDisplay(shown(c.first), shown(c.first), LOADED)).toEqual({ inPlace: true });
  });

  it("connects in full when the page shows nothing of the game's, or a new application", () => {
    const c = compiling();
    const next = c.edit("The second line.", "The second line, edited.");
    expect(classifyDisplay(undefined, shown(next), LOADED)).toEqual({ inPlace: false, reason: "unshown" });
    expect(classifyDisplay(shown(c.first), shown(next), { fresh: true, checkpointLoads: true })).toEqual({
      inPlace: false,
      reason: "unshown",
    });
  });

  it("connects in full when the route left no checkpoint to load", () => {
    const c = compiling();
    expect(classifyDisplay(shown(c.first), shown(c.first), { fresh: false, checkpointLoads: false })).toEqual({
      inPlace: false,
      reason: "route",
    });
  });

  it("connects in full when the cursor is on another line", () => {
    const c = compiling();
    expect(
      classifyDisplay(shown(c.first), shown(c.first, { line: lineOf(SCRIPT, "The first line.") }), LOADED),
    ).toEqual({ inPlace: false, reason: "point" });
  });

  it("connects in full when a suggestion's program replaces the real one, or the reverse", () => {
    const c = compiling();
    const next = c.edit("The second line.", "The second line, edited.");
    expect(classifyDisplay(shown(c.first), shown(next, { speculative: true }), LOADED)).toEqual({
      inPlace: false,
      reason: "swap",
    });
    expect(classifyDisplay(shown(c.first, { speculative: true }), shown(next), LOADED)).toEqual({
      inPlace: false,
      reason: "swap",
    });
  });

  it("connects in full when the program is not measured against the one shown", () => {
    const c = compiling();
    c.edit("The second line.", "The second line, edited.");
    const third = c.edit("The second line, edited.", "The second line, edited again.");
    expect(classifyDisplay(shown(c.first), shown(third), LOADED)).toEqual({
      inPlace: false,
      reason: "program",
    });
  });

  it("connects in full when a statement that does not span the cursor's line changed", () => {
    const c = compiling();
    const edited = c.edit("The first line.", "The first line, edited.");
    // Where the statement stands decides, whatever symbols it moved.
    const changes = edited.changes!;
    const next = { ...edited, changes: { ...changes, chunks: { ...changes.chunks!, moved: [] } } };
    expect(classifyDisplay(shown(c.first), shown(next), LOADED)).toEqual({
      inPlace: false,
      reason: "statements",
    });
  });

  it("connects in full when what the page's construction reads changed", () => {
    const c = compiling();
    const next = c.edit("The second line.", "The second line, edited.");
    // The define tables were built again.
    expect(
      classifyDisplay(shown(c.first), shown(next, { definesContextBuilds: 2 }), LOADED),
    ).toEqual({ inPlace: false, reason: "context" });
    // A layout channel the compiler handed out anew.
    expect(
      classifyDisplay(shown(c.first), shown({ ...next, layouts: { ...next.layouts } }), LOADED),
    ).toEqual({ inPlace: false, reason: "context" });
    // An image channel, likewise; the filtered images a directive implies
    // may differ.
    const assets = { ...next.assets, image: { ...next.assets?.["image"] } };
    expect(classifyDisplay(shown(c.first), shown({ ...next, assets }), LOADED)).toEqual({
      inPlace: false,
      reason: "context",
    });
    const filtered = { ...next.assets, filtered_image: { ...next.assets?.["filtered_image"] } };
    expect(classifyDisplay(shown(c.first), shown({ ...next, assets: filtered }), LOADED)).toEqual({
      inPlace: true,
    });
  });

  it("connects in full when the scene map changed", () => {
    const c = compiling();
    const next = c.edit("The second line.", "The second line, edited.");
    const scenes = { ...next.sceneAssets };
    const start = scenes["start"]!;
    scenes["start"] = { ...start, successors: [...start.successors, "other"] };
    expect(classifyDisplay(shown(c.first), shown({ ...next, sceneAssets: scenes }), LOADED)).toEqual({
      inPlace: false,
      reason: "scenes",
    });
    const fewer = { ...next.sceneAssets };
    delete fewer["other"];
    expect(classifyDisplay(shown(c.first), shown({ ...next, sceneAssets: fewer }), LOADED)).toEqual({
      inPlace: false,
      reason: "scenes",
    });
  });
});

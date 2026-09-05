// The page's cursor hint (#434): what it asks the cache for when the cursor
// lands, and what it does not ask twice.

import { type AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it } from "vitest";
import { planPreviewHint, type PreviewHintState } from "./previewHint";

const URI = "file://proj/main.sd";

const asset = (name: string): File => ({
  uri: `file://proj/${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/proj/${name}.png?v=1`,
});

// Line numbers matter: `bunny` (line 3) and `hat` (line 5) display together
// with the line between them; `cat` (line 10) is a later scrub's.
const STORY = `scene A
  [[show backdrop room]]
  Line one.
  [[show portrait bunny]]
  Line two.
  [[show portrait hat]]
  Line three.
  Line three, continued.
  Line three, and more.
  Line three, at length.
  [[show portrait cat]]
  Line four.
  [[show portrait dog]]
  Line five.
  -> B
end

scene B
  [[show backdrop room2]]
  Line six.
  done
end
`;

function compile(source: string, version = 1): SparkProgram {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    experimentalDisplayCalls: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version,
        languageId: "sparkdown",
      },
      ...["room", "room2", "bunny", "hat", "cat", "dog"].map(asset),
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } } as any).program;
}

const entriesOf = (program: SparkProgram) =>
  Object.entries(program.pathLocations ?? {}) as Array<
    [string, [number, number, number, number, number]]
  >;

const srcs = (items: AssetItem[] | null) =>
  items?.map((i) =>
    ("src" in i ? i.src : "").split("/").pop()!.split("?")[0],
  ) ?? null;

describe("planPreviewHint", () => {
  const program = compile(STORY);
  const entries = entriesOf(program);
  const plan = (line: number, last?: PreviewHintState) =>
    planPreviewHint(program, URI, line, entries, last);

  it("asks for the cursor's beats first, the window next, and the scene once on entering it", () => {
    const first = plan(3)!;
    expect(first).not.toBeNull();
    expect(srcs(first.cursor)).toEqual(["bunny.png", "hat.png"]);
    // The default window is 32 beats either side: the whole of this scene.
    expect(srcs(first.near)).toEqual([
      "room.png",
      "bunny.png",
      "hat.png",
      "cat.png",
      "dog.png",
    ]);
    expect(srcs(first.rest)).toEqual([]);
    expect(first.state).toMatchObject({ uri: URI, scene: "A", beat: 1, line: 3 });
  });

  it("asks for nothing again on the same line, or on another line of the same beat", () => {
    const first = plan(3)!;
    expect(plan(3, first.state)).toBeNull();
    // Line 4 is the line that displays with the bunny beat.
    const same = plan(4, first.state)!;
    expect(same.cursor).toEqual([]);
    expect(same.near).toEqual([]);
    expect(same.rest).toBeNull();
    expect(same.state.beat).toBe(first.state.beat);
  });

  it("asks for a new beat's pictures, and not the scene again, when the cursor moves inside the scene", () => {
    const first = plan(3)!;
    const moved = plan(10, first.state)!;
    expect(srcs(moved.cursor)).toEqual(["cat.png", "dog.png"]);
    expect(moved.rest).toBeNull();
    expect(moved.state.beat).toBe(3);
  });

  it("asks for the scene again when the cursor enters another scene", () => {
    const first = plan(3)!;
    const inB = plan(18, first.state)!;
    expect(inB.state.scene).toBe("B");
    expect(srcs(inB.cursor)).toEqual(["room2.png"]);
    expect(inB.rest).not.toBeNull();
  });

  it("treats a recompile that left the cursor on its beat as nothing new", () => {
    const first = plan(3)!;
    const recompiled = compile(STORY, 2);
    const again = planPreviewHint(recompiled, URI, 3, entriesOf(recompiled), first.state)!;
    expect(again).not.toBeNull();
    expect(again.cursor).toEqual([]);
    expect(again.rest).toBeNull();
    expect(again.state.version).toBe(recompiled.version);
  });
});

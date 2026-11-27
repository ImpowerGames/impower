import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { File } from "../../src/compiler/types/File";

const URI = "file://proj/main.sd";

const script = (text: string): File => ({
  uri: URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const asset = (type: string, name: string, ext: string): File => ({
  uri: `file://proj/${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const SOURCE = `framing close {
  zoom = 1.5
}

scene start
  [[show backdrop hall at right]]
  The hall wakes.
  [[animate backdrop to close over 3s]]
  The view leans in.
  [[show portrait nova]] [[nova]]
  Nova looks up.
  [[hide portrait with fade]] ((play sound chime))
  Nova leaves.
  [[show backdrop dusk with grow]]
  Dusk falls.
end
`;

const compile = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [script(SOURCE), asset("image", "hall", "png"), asset("image", "nova", "svg"), asset("image", "dusk", "svg"), asset("audio", "chime", "wav")],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
};

describe("the scene table carries each image write's framing (#2813)", () => {
  const beats = compile().sceneAssets!["start"]!.beats;

  it("lists the framing a write shows its picture at, and the framing a move ends at", () => {
    expect(beats[0]!.writes).toEqual([{ target: "backdrop", image: ["hall"], at: "right" }]);
    expect(beats[1]!.writes).toEqual([{ target: "backdrop", animate: true, to: "close" }]);
  });

  it("carries no framing for a write with none, and records a write's target, its pictures, a hide and its effect", () => {
    expect(beats[2]!.writes).toEqual([{ target: "portrait", image: ["nova"] }, { image: ["nova"] }]);
    expect(beats[3]!.writes).toEqual([{ target: "portrait", with: "fade", hide: true }]);
    expect(beats[3]!.audio).toEqual(["chime"]);
    expect(beats[4]!.writes).toEqual([{ target: "backdrop", image: ["dusk"], with: "grow" }]);
  });

  it("keeps the names each beat loads as they were", () => {
    expect(beats.map((beat) => beat.image)).toEqual([["hall"], undefined, ["nova", "nova"], undefined, ["dusk"]]);
  });
});

const BRANCHES = `scene start
  Pick a door:
  choose
    + (a) Left
      [[show backdrop dusk]]
      The left door opens.
    + (b) Right
      [[show backdrop hall]]
      The right door opens.
  end
  [[animate backdrop to close over 1s]]
  Both doors lead here.
end
`;

describe("the scene table carries the blocks each beat sits in (#2813)", () => {
  it("gives each branch of a choice its own scope, and the beat where they join none", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [script(BRANCHES), asset("image", "hall", "png"), asset("image", "dusk", "svg")] });
    const beats = compiler.compile({ textDocument: { uri: URI } }).program.sceneAssets!["start"]!.beats;
    expect(beats.map((beat) => beat.writes?.[0]?.image?.[0] ?? beat.writes?.[0]?.to)).toEqual(["dusk", "hall", "close"]);
    const [left, right, join] = beats.map((beat) => beat.scope);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left![0]![0]).toBe(right![0]![0]);
    expect(left![0]![1]).not.toBe(right![0]![1]);
    expect(join).toBeUndefined();
  });
});

const STATEMENTS = `store open = true

scene start
  if open
    [[show backdrop hall]]
    Open.
  else
    [[show backdrop dusk]]
    Shut.
  end
  if open
    [[show portrait nova]]
    Nova.
  end
end
`;

describe("the scene table tells the arms of one decision from separate decisions (#2813)", () => {
  it("gives the arms of an if the same decision and separate arms, and a later if another decision", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [script(STATEMENTS), asset("image", "hall", "png"), asset("image", "dusk", "svg"), asset("image", "nova", "svg")] });
    const beats = compiler.compile({ textDocument: { uri: URI } }).program.sceneAssets!["start"]!.beats;
    const [open, shut, later] = beats.map((beat) => beat.scope![0]!) as [[number, number], [number, number], [number, number]];
    expect(open[0]).toBe(shut[0]);
    expect(open[1]).not.toBe(shut[1]);
    expect(later[0]).not.toBe(open[0]);
  });
});

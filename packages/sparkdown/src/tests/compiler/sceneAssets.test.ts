import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import {
  createSceneAssetCapture,
  type SceneAssetCapture,
} from "../../compiler/types/SceneAssets";
import { type SparkProgram } from "../../compiler/types/SparkProgram";
import { generatePerfScreenplay } from "./perfFixture";

// `program.sceneAssets` is what the engine's asset module predicts and loads
// from (docs/engine/asset-preloading-spec.md): per top-level flow, the asset
// names its beats reference in document order, the flows it reaches, and
// whether any name is only knowable at runtime.

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

const ASSETS: File[] = [
  asset("image", "room", "png"),
  asset("image", "bunny", "svg"),
  asset("image", "hat", "svg"),
  asset("audio", "theme", "mp3"),
  asset("audio", "chime", "wav"),
  asset("video", "clip", "mp4"),
];

const FIXTURE = `store mood = "hat"

[[show backdrop room]]

scene A
  [[show portrait bunny~hat+hat]]
  ((play music theme))
  [[open hud]]
  branch inner
    Hi there. [[show portrait bunny]]
    choose
      * Go
        -> B
      * Stay
        -> Other ->
    then (after)
      done
    end
  end
  & Fn()
  [[load Other]]
  -> B
end

scene B
  [[show backdrop room]]
  done
end

scene Other
  ((play sound chime))
  done
end

function Fn()
  local x = 1
end
`;

function compile(text: string, options: { experimentalDisplayCalls?: boolean } = {}) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [script(text), ...ASSETS],
    ...options,
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

describe.each([
  { experimentalDisplayCalls: false },
  { experimentalDisplayCalls: true },
])("program.sceneAssets (%o)", (options) => {
  const program = compile(FIXTURE, options);
  const sceneAssets = program.sceneAssets!;

  it("has an entry per top-level flow, including root content and functions", () => {
    expect(Object.keys(sceneAssets).sort()).toEqual(
      ["0", "A", "B", "Fn", "Other"].sort(),
    );
    expect(sceneAssets["0"]!.kind).toBe("root");
    expect(sceneAssets["A"]!.kind).toBe("scene");
    expect(sceneAssets["Fn"]!.kind).toBe("function");
  });

  it("records root-level directives under the pseudo-flow 0", () => {
    expect(sceneAssets["0"]!.image).toEqual(["room"]);
  });

  it("unions a scene's names in first-use order and records the functions it calls", () => {
    const a = sceneAssets["A"]!;
    // `bunny` comes from the branch's inline directive, after the layered
    // `bunny~hat+hat` on the scene's first line.
    expect(a.image).toEqual(["bunny~hat", "hat", "bunny"]);
    expect(a.audio).toEqual(["theme"]);
    expect(a.layouts).toEqual(["hud"]);
    expect(a.loads).toEqual(["Other"]);
    // A Luau call diverts through the variable holding the function; that is
    // a call edge, never a successor and never a dynamic target.
    expect(a.calls).toEqual(["Fn"]);
    expect(sceneAssets["Fn"]!.image).toEqual([]);
  });

  it("classifies divert edges into successors and calls", () => {
    const a = sceneAssets["A"]!;
    expect(a.successors.sort()).toEqual(["B", "Other"]);
    expect(a.successors).not.toContain("Fn");
    expect(sceneAssets["B"]!.successors).toEqual([]);
    expect(sceneAssets["Other"]!.audio).toEqual(["chime"]);
  });

  it("is static when every name is authored literally", () => {
    // Braces inside a directive are literal text to the grammar, so no
    // directive in this fixture is cut by an interpolation; the dynamic path
    // is covered by the scanner's own tests.
    for (const flow of Object.values(sceneAssets)) {
      expect(flow.dynamic).toBeUndefined();
      expect(flow.dynamicBases).toBeUndefined();
    }
  });

  it("lists beats in document order with paths the location map knows", () => {
    const a = sceneAssets["A"]!;
    const kinds = a.beats.map((b) =>
      b.image ? "image" : b.audio ? "audio" : b.layouts ? "layouts" : "loads",
    );
    expect(kinds).toEqual(["image", "audio", "layouts", "image", "loads"]);
    expect(a.beats[0]!.image).toEqual(["bunny~hat", "hat"]);
    expect(a.beats[3]!.image).toEqual(["bunny"]);
    for (const beat of a.beats) {
      expect(beat.path.startsWith("A")).toBe(true);
      expect(program.pathLocations?.[beat.path]).toBeDefined();
    }
  });
});

// A function body is Luau, so it cannot carry a display directive; the
// callee-widening is exercised directly on captures instead.
class Probe extends SparkdownCompiler {
  build(captures: Record<string, SceneAssetCapture>, functionNames: string[]) {
    this._flowAssetAccum = new Map(Object.entries(captures));
    const program: SparkProgram = {
      uri: URI,
      scripts: {},
      files: {},
      functionLocations: Object.fromEntries(
        functionNames.map((name) => [name, [0, 0, 0, 0, 0] as const]),
      ),
    } as SparkProgram;
    this.populateSceneAssets(program);
    return program.sceneAssets!;
  }
}

describe("populateSceneAssets", () => {
  it("widens a flow by the functions it calls, transitively, and classifies edges", () => {
    const captures: Record<string, SceneAssetCapture> = {
      "0": createSceneAssetCapture(),
      A: {
        beats: [{ path: "A.0", image: ["a1"], audio: ["m"] }],
        edges: [
          { target: "Helper", call: true },
          { target: "B", call: false },
          { target: "A", call: false },
        ],
        dynamic: false,
        dynamicBases: [],
      },
      Helper: {
        beats: [{ path: "Helper.0", image: ["h1", "a1"], layouts: ["hud"] }],
        edges: [{ target: "Deeper", call: true }],
        dynamic: false,
        dynamicBases: [],
      },
      Deeper: {
        beats: [{ path: "Deeper.0", image: ["d1"] }],
        edges: [{ target: "Helper", call: true }],
        dynamic: true,
        dynamicBases: ["d"],
      },
      B: {
        beats: [],
        edges: [{ target: "Tunneled", call: false }],
        dynamic: false,
        dynamicBases: [],
      },
      Tunneled: createSceneAssetCapture(),
    };
    const result = new Probe().build(captures, ["Helper", "Deeper"]);
    expect(result["A"]!.kind).toBe("scene");
    expect(result["Helper"]!.kind).toBe("function");
    expect(result["0"]!.kind).toBe("root");
    // Own names first, then callees in call order, each once.
    expect(result["A"]!.image).toEqual(["a1", "h1", "d1"]);
    expect(result["A"]!.audio).toEqual(["m"]);
    expect(result["A"]!.layouts).toEqual(["hud"]);
    expect(result["A"]!.calls).toEqual(["Helper"]);
    expect(result["A"]!.successors).toEqual(["B"]);
    // A dynamic callee makes the caller dynamic and lends its bases.
    expect(result["A"]!.dynamic).toBe(true);
    expect(result["A"]!.dynamicBases).toEqual(["d"]);
    // Beats stay the flow's own.
    expect(result["A"]!.beats).toBe(captures["A"]!.beats);
    expect(result["B"]!.successors).toEqual(["Tunneled"]);
    expect(result["B"]!.dynamic).toBeUndefined();
  });
});

describe("video assets", () => {
  it("reach the asset channel and the context like images do", () => {
    const program = compile("scene A\n  done\nend\n");
    expect(program.assets?.["video"]?.["clip"]?.src).toBe(
      "/file:/proj/clip.mp4?v=1",
    );
    expect(program.context?.["video"]?.["clip"]?.$type).toBe("video");
  });
});

describe("perf fixture", () => {
  it("captures every scene's backdrop without measurable cost", () => {
    const sceneCount = 40;
    const text = generatePerfScreenplay(sceneCount);
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [script(text)] });
    const started = performance.now();
    const program = compiler.compile({ textDocument: { uri: URI } }).program;
    const elapsed = performance.now() - started;
    for (let s = 0; s < sceneCount; s++) {
      const scene = program.sceneAssets?.[`Scene_${s}`];
      expect(scene?.kind).toBe("scene");
      expect(scene?.image).toContain(`location_${s % 10}`);
      expect(scene?.beats[0]?.image).toEqual([`location_${s % 10}`]);
    }
    // A generous ceiling: the capture rides the existing location walk, so a
    // compile of this size stays well under it on any machine that runs the
    // suite at all.
    expect(elapsed).toBeLessThan(20_000);
  });
});

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";
import { bakeMorphArtifact } from "../../morph/bake";
import { layeredMorphArtwork, layeredMorphDrawn, layeredMorphModel, type LayeredMorphArtwork } from "../../morph/layered";
import { buildMorphRecipe } from "../../morph/recipe";
import { morphFrameState, morphPosesAt } from "../../morph/render";
import type { MorphArtifact } from "../../morph/types";

const MAIN = "file:///proj/main.sd";
const asset = (path: string): File => ({
  uri: `file:///proj/assets/${path}`,
  type: "image",
  name: path.split("/").at(-1)!.split(".")[0]!,
  ext: SparkdownWorkspace.prototype.getFileExtension(`file:///proj/assets/${path}`),
  src: `/local/assets/${path}`,
});

const MIA = [
  "mia/90 body.png",
  "mia/70 head/60 face.happy/40 lids.on.png",
  "mia/70 head/60 face.happy/30 mouth.open.png",
  "mia/70 head/60 face.happy/30 mouth.closed default.png",
  "mia/70 head/60 face.neutral default/40 lids.on.png",
  "mia/70 head/60 face.neutral default/30 mouth.open.png",
  "mia/70 head/60 face.neutral default/30 mouth.closed default.png",
  "mia/70 head/50 skin.png",
];

const compile = (paths: readonly string[], text = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      ...paths.map(asset),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

const artworkOf = (paths: readonly string[]): LayeredMorphArtwork => {
  const context = compile(paths).context!;
  return layeredMorphArtwork(context as never, context["layered_image"]!["mia"])!;
};

const bake = (artwork: LayeredMorphArtwork, morph: Record<string, unknown>, selection: Record<string, string> = {}) =>
  bakeMorphArtifact({ source: artwork.text, selection, recipes: [buildMorphRecipe("m", morph as never)], key: "k" });

const drawnAt = (artifact: MorphArtifact, offset: number) =>
  layeredMorphDrawn(layeredMorphModel(artifact)!, morphFrameState(artifact, morphPosesAt(artifact, { m: offset })));

const BLINK = (moved: Record<string, unknown> = {}) => ({
  blend: "cut",
  keyframes: [
    { offset: 0, lids: { state: "off" } },
    { offset: 0.5, lids: { state: "on" }, ...moved },
    { offset: 1, lids: { state: "off" } },
  ],
});

const fileOf = (artwork: LayeredMorphArtwork, path: string) =>
  artwork.files.findIndex((file) => file.src === `/local/assets/${path}`);

const shownFiles = (artifact: MorphArtifact, offset: number) => drawnAt(artifact, offset).map(({ file }) => file).sort();

describe("morphs on a portrait folder that groups its layers in folders (#2635)", () => {
  const artwork = artworkOf(MIA);
  const happyLids = fileOf(artwork, "mia/70 head/60 face.happy/40 lids.on.png");
  const neutralLids = fileOf(artwork, "mia/70 head/60 face.neutral default/40 lids.on.png");

  test("the artwork groups every file under its folders", () => {
    expect(happyLids).toBeGreaterThanOrEqual(0);
    expect(neutralLids).toBeGreaterThanOrEqual(0);
    expect(artwork.text).toMatch(/<g data-name="head"><g data-name="face.happy">/);
  });

  test.each([
    ["mia", {}, "neutral"],
    ["mia:happy", { face: "happy" }, "happy"],
  ] as const)("a blink on %s is live and shows only that face's lids while the face shows", (_look, selection, face) => {
    const artifact = bake(artwork, BLINK(), selection);
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    const own = face === "happy" ? happyLids : neutralLids;
    const other = face === "happy" ? neutralLids : happyLids;
    expect(shownFiles(artifact, 0)).not.toContain(own);
    expect(shownFiles(artifact, 0.5)).toContain(own);
    expect(shownFiles(artifact, 0.5)).not.toContain(other);
    expect(shownFiles(artifact, 0)).not.toContain(other);
  });

  test("moving a folder's label wraps every layer under it once", () => {
    const artifact = bake(artwork, BLINK({ head: { translate: "0 4px" } }));
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    const live = artifact.parts.filter((part) => part.kind === "live").map((part) => part.svg).join("");
    expect(live.match(/data-morph-motion=/g)).toHaveLength(1);
    const head = artwork.files.flatMap((file, index) => (file.src.includes("/70 head/") ? [index] : []));
    const drawn = drawnAt(artifact, 0.5);
    for (const file of head) {
      const entry = drawn.find((d) => d.file === file);
      if (entry) expect(entry.motions).toEqual([{ label: "head", wrapper: 0 }]);
    }
    expect(drawn.find((d) => d.file === fileOf(artwork, "mia/90 body.png"))!.motions).toEqual([]);
    expect(drawn.filter((d) => head.includes(d.file)).length).toBeGreaterThanOrEqual(3);
  });

  test("a label repeated inside a moved folder moves from the outermost", () => {
    const nested = artworkOf([...MIA, "mia/70 head/45 head shine.png"]);
    const artifact = bake(nested, BLINK({ head: { translate: "0 4px" } }));
    expect(artifact.status).toBe("live");
    const live = artifact.parts.filter((part) => part.kind === "live").map((part) => part.svg).join("");
    expect(live.match(/data-morph-motion=/g)).toHaveLength(1);
    const shine = fileOf(nested, "mia/70 head/45 head shine.png");
    expect(drawnAt(artifact, 0.5).find((d) => d.file === shine)!.motions).toEqual([{ label: "head", wrapper: 0 }]);
  });

  test("a layer file with no label takes its `layers` settings from the nearest labelled folder around it", () => {
    const cut = drawnAt(bake(artwork, BLINK()), 0.1).find((d) => d.file === neutralLids);
    expect(cut).toBeUndefined();
    const faded = bake(artwork, { ...BLINK(), layers: { head: { blend: "fade" } } });
    expect(faded.status).toBe("live");
    const entry = drawnAt(faded, 0.1).find((d) => d.file === neutralLids);
    expect(entry!.opacity).toBeGreaterThan(0);
    expect(entry!.opacity).toBeLessThan(1);
  });

  test("a file inside a hidden folder never shows in any pose", () => {
    const hidden = artworkOf([...MIA, "mia/80 hat.on/20 feather.png"]);
    const feather = fileOf(hidden, "mia/80 hat.on/20 feather.png");
    expect(feather).toBeGreaterThanOrEqual(0);
    const artifact = bake(hidden, BLINK());
    expect(artifact.status).toBe("live");
    for (const offset of [0, 0.25, 0.5, 0.75, 1]) expect(shownFiles(artifact, offset)).not.toContain(feather);
  });
});

const TALK = `morph talk {
  blend = cut
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
}
`;

describe("the fit rule reads a portrait's layer folders (#2635)", () => {
  const SHUT = MIA.filter((path) => path !== "mia/70 head/60 face.happy/30 mouth.open.png");
  const program = compile(SHUT, `${TALK}\nscene start\n  [[mia]]\n  [[mia:happy]]\nend\n`);
  const messages = (program.diagnostics?.[MAIN] ?? []).map((d: any) => String(d.message?.value ?? d.message));

  test("a face folder missing a state the morph names keeps the morph off the looks that show it, naming the folder", () => {
    const warning = messages.find((message) => message.includes("does not apply to"));
    expect(warning).toBeDefined();
    expect(warning).toContain('folder "face.happy" draws no `mouth.open`');
    expect(Object.keys(program.morphs?.variants ?? {})).not.toContain("mia:happy");
    expect(compile(MIA, `${TALK}\nscene start\n  [[mia:happy]]\nend\n`).morphs?.variants["mia:happy"]?.length ?? 0).toBeGreaterThan(0);
  });

  test("the looks that show the other face still play it", () => {
    expect(program.morphs?.variants["mia"]?.length ?? 0).toBeGreaterThan(0);
  });
});

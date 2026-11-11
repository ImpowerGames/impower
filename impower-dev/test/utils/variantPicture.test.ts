// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { imageStacks } from "../../src/modules/spark-editor/utils/imageStacks";
import { variantOf, type VariantSelection } from "../../src/modules/spark-editor/utils/imageVariants";
import { variantPicture } from "../../src/modules/spark-editor/utils/variantPicture";

const ROOT = "file:///project";
const MAIN = `${ROOT}/main.sd`;
const P = "Assets/Images/Portraits";

const compile = (paths: readonly string[], text = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      ...paths.map((path) => {
        const leaf = path.split("/").at(-1)!;
        return {
          uri: `${ROOT}/${path}`,
          type: "image",
          name: leaf.split(".")[0]!,
          ext: leaf.split(".").at(-1)!,
          src: `/src/${path}`,
          version: 1,
        };
      }),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!.context!;
};

let drawn: string[] = [];

const stubComposition = () => {
  drawn = [];
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    blob: async () => new Blob([url]),
    headers: { get: () => null },
  }));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => ({ width: 100, height: 200, close() {}, tag: await blob.text() }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: (bitmap: { tag: string }) => drawn.push(bitmap.tag) };
      }
      async convertToBlob() {
        return new Blob([new Uint8Array(16)], { type: "image/webp" });
      }
    },
  );
};

afterEach(() => vi.unstubAllGlobals());

const MIA = [`${P}/mia/90_body.png`, `${P}/mia/30_face.neutral~default.png`, `${P}/mia/30_face.happy.png`, `${P}/mia/10_hat.on.png`];

const picture = (paths: readonly string[], selection: VariantSelection, text = "") =>
  variantPicture(compile(paths, text), variantOf(imageStacks(paths)[0]!, selection));

describe("the tester's picture", () => {
  it("draws a folder stack's combination as the engine stacks it, bottom first", async () => {
    stubComposition();
    const src = await picture(MIA, { face: "happy", hat: "on" });
    expect(src).toMatch(/^data:image\/webp;base64,/);
    expect(drawn).toEqual([`/src/${P}/mia/90_body.png`, `/src/${P}/mia/30_face.happy.png`, `/src/${P}/mia/10_hat.on.png`]);
  });

  it("draws the resting combination with the default layer", async () => {
    stubComposition();
    await picture(MIA, {});
    expect(drawn).toEqual([`/src/${P}/mia/90_body.png`, `/src/${P}/mia/30_face.neutral~default.png`]);
  });

  it("follows the program: a script that redefines the picture changes what the tester draws", async () => {
    stubComposition();
    const paths = [...MIA, `${P}/still.png`];
    const redefined = `define mia as layered_image with\n  assets = { still }\nend\n`;
    expect(await picture(paths, { face: "happy" }, redefined)).toBe(`/src/${P}/still.png`);
  });

  it("shows a sibling-file stack's base until the engine stacks sibling files (#1039)", async () => {
    stubComposition();
    const paths = [`${P}/imani.png`, `${P}/imani~face.happy.png`];
    expect(await picture(paths, { face: "happy" })).toBe(`/src/${P}/imani.png`);
    expect(drawn).toEqual([]);
  });

  it("draws an alternate's own file", async () => {
    stubComposition();
    const paths = [`${P}/imani.png`, `${P}/imani@night.png`];
    expect(await picture(paths, { "@": "night" })).toBe(`/src/${P}/imani@night.png`);
  });

  it("draws nothing without a program", async () => {
    expect(await variantPicture(undefined, { image: "mia", attributes: [] })).toBeNull();
  });
});

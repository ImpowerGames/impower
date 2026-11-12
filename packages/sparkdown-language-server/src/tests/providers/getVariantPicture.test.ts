// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getVariantPicture, type ImageVariant } from "../../utils/providers/getVariantPicture";

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

const picture = (paths: readonly string[], variant: ImageVariant, text = "") =>
  getVariantPicture(compile(paths, text), variant);

describe("the tester's picture", () => {
  it("draws a folder stack's combination as the engine stacks it, bottom first", async () => {
    stubComposition();
    const src = await picture(MIA, { image: "mia", attributes: ["happy", "hat"] });
    expect(src).toMatch(/^data:image\/webp;base64,/);
    expect(drawn).toEqual([`/src/${P}/mia/90_body.png`, `/src/${P}/mia/30_face.happy.png`, `/src/${P}/mia/10_hat.on.png`]);
  });

  it("draws the resting combination with the default layer", async () => {
    stubComposition();
    await picture(MIA, { image: "mia", attributes: [] });
    expect(drawn).toEqual([`/src/${P}/mia/90_body.png`, `/src/${P}/mia/30_face.neutral~default.png`]);
  });

  it("follows the program: a script that redefines the picture changes what the tester draws", async () => {
    stubComposition();
    const paths = [...MIA, `${P}/still.png`];
    const redefined = `define mia as layered_image with\n  assets = { still }\nend\n`;
    expect(await picture(paths, { image: "mia", attributes: ["happy"] }, redefined)).toBe(`/src/${P}/still.png`);
  });

  it("shows a sibling-file stack's base until the engine stacks sibling files (#1039)", async () => {
    stubComposition();
    const paths = [`${P}/imani.png`, `${P}/imani~face.happy.png`];
    expect(await picture(paths, { image: "imani", attributes: ["happy"] })).toBe(`/src/${P}/imani.png`);
    expect(drawn).toEqual([]);
  });

  it("draws an alternate's own file", async () => {
    stubComposition();
    const paths = [`${P}/imani.png`, `${P}/imani@night.png`];
    expect(await picture(paths, { image: "imani@night", attributes: [] })).toBe(`/src/${P}/imani@night.png`);
  });

  it("answers an empty picture, not a failure, for a combination that shows no layer", async () => {
    stubComposition();
    const switches = [`${P}/mia/90_hat.on.png`, `${P}/mia/30_glasses.on.png`];
    expect(await picture(switches, { image: "mia", attributes: [] })).toBe("");
    expect(drawn).toEqual([]);
  });

  it("draws at the size the tester asks for, up to the art's own size, while the hover keeps 360", async () => {
    const canvases: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => ({ ok: true, blob: async () => new Blob([url]), headers: { get: () => null } }));
    vi.stubGlobal("createImageBitmap", async (_blob: Blob, opts?: ImageBitmapOptions) => {
      const width = opts?.resizeWidth ?? 300;
      return { width, height: opts?.resizeHeight ?? Math.round((width * 4) / 3), close() {} };
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(width: number, height: number) {
          canvases.push(`${width}x${height}`);
        }
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(16)], { type: "image/webp" });
        }
      },
    );
    const context = compile(MIA);
    const variant = { image: "mia", attributes: ["hat"] };
    await getVariantPicture(context, variant, { size: 1280 });
    await getVariantPicture(context, variant, { size: 240 });
    await getVariantPicture(context, variant);
    expect(canvases).toEqual(["300x400", "180x240", "270x360"]);
  });

  it("draws nothing without a program", async () => {
    expect(await getVariantPicture(undefined, { image: "mia", attributes: [] })).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrCreateFilteredSvg, type FilteredSvgCache } from "../../filters/filteredSvg";
import { ImageVocabularyCache } from "../../workspace/utils/prepareImageFile";
import { getImageCompositeSrc } from "../../compiler/utils/getImageComposite";

afterEach(() => vi.unstubAllGlobals());
describe("portrait content freshness", () => {
  it("refreshes served SVG bytes when size and modification time are unchanged", async () => {
    const entries = new Map<string, string>();
    const cache: FilteredSvgCache = {
      match: async key => entries.has(key) ? new Response(entries.get(key)) : undefined,
      put: async (key, response) => { entries.set(key, await response.text()); },
      delete: async key => entries.delete(key), keys: async () => [...entries.keys()].map(url => ({url})),
    };
    const file = (color: string) => Object.assign(new Blob([
      `<svg><path data-name="body" fill="${color}"/></svg>`,
    ]), { lastModified: 1 });
    const red = await getOrCreateFilteredSvg(cache, "same.svg", file("red"), "{}");
    expect(await red!.text()).toContain("red");
    const tan = await getOrCreateFilteredSvg(cache, "same.svg", file("tan"), "{}");
    expect(await tan!.text()).toContain("tan");
  });

  it("normalizes raw Affinity source before serving resting SVG artwork", async () => {
    const cache: FilteredSvgCache = { match: async () => undefined, put: async () => {}, delete: async () => false, keys: async () => [] };
    const file = Object.assign(new Blob(['<svg><g id="hat" serif:id="hat.on"><path/></g><g id="body"/></svg>']), {lastModified: 1});
    const response = await getOrCreateFilteredSvg(cache, "raw-affinity.svg", file, "{}");
    const text = await response!.text();
    expect(text).toContain("id='body'");
    expect(text).not.toContain("id='hat'");
  });

  it("changes the served URL after an equal-length SVG edit with a stable version", () => {
    const cache = new ImageVocabularyCache();
    const file = (color: string) => ({ uri: "file:///assets/mia.svg", name: "mia", type: "image",
      ext: "svg", version: 1, src: "/file:/assets/mia.svg?v=1",
      text: `<svg><path data-name="body" fill="${color}"/></svg>` });
    expect(cache.prepare(file("red")).src).not.toEqual(cache.prepare(file("tan")).src);
  });

  it.each([undefined, 1])("reloads bridge layers after same-size replacements (host version %s)", async (version) => {
    vi.stubGlobal("fetch", async () => { throw new Error("bridge only"); });
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => ({ width: 10, height: 10,
      text: await blob.text(), close() {} }));
    vi.stubGlobal("OffscreenCanvas", class {
      drawn: string[] = [];
      getContext() { return { drawImage: (bitmap: any) => this.drawn.push(bitmap.text) }; }
      async convertToBlob() { return new Blob([this.drawn.join(",")], {type: "image/webp"}); }
    });
    const context = { image: Object.fromEntries(["body", "hat"].map(name => [name,
      { $type: "image", $name: name, version, uri: `vscode-vfs:///fresh/${name}.png`, src: `vscode-vfs:///fresh/${name}.png` }])),
      layered_image: { mia: { $type: "layered_image", $name: "mia", assets:
        ["body", "hat"].map($name => ({$type: "image", $name})) } } };
    let bytes = "old";
    const options = { readFileBytes: async () => btoa(bytes) };
    const first = await getImageCompositeSrc(context, context.layered_image.mia, options);
    expect(first).toBeDefined();
    bytes = "new";
    if (version !== undefined) Object.values(context.image).forEach(image => { image.version = version + 1; });
    const second = await getImageCompositeSrc(context, context.layered_image.mia, options);
    expect(second).not.toBe(first);
    expect(atob(second!.split(",")[1]!)).toBe("new,new");
  });
});

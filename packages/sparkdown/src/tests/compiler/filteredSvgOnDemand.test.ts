// #299: filtered images resolve to on-demand `?filters=` URLs (service-worker
// generated, signature-cached) instead of the program embedding every SVG's
// source. These tests pin the three seams: the compiler strip (opt-in,
// per-host), filterImage's URL fallback when a root carries no data, and the
// shared cached generator both service workers delegate to.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { filterImage } from "../../compiler/utils/filterImage";
import {
  getOrCreateFilteredSvg,
  serializeImageFilterParam,
  type FilteredSvgFile,
} from "../../filters/filteredSvg";

const MAIN_URI = "file://proj/main.sd";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='filter hat'><path/></g><g id='filter default body'><path/></g></svg>`;

const svgAsset = (name: string): File => ({
  uri: `file://proj/assets/${name}.svg`,
  type: "image",
  name,
  ext: "svg",
  src: `/file:/local/assets/${name}.svg?v=1`,
  text: SVG,
});

const compileWith = (config: { stripImageData?: boolean }) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...config,
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: "",
        version: 1,
        languageId: "sparkdown",
      },
      svgAsset("portrait"),
    ],
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
};

describe("stripImageData", () => {
  it("keeps inlined SVG source by default (data-dependent hosts)", () => {
    const program: any = compileWith({});
    expect(program.context?.image?.portrait?.data).toMatch(
      /^data:image\/svg\+xml,/,
    );
  });

  it("strips inlined SVG source from context when opted in, keeping src", () => {
    const program: any = compileWith({ stripImageData: true });
    const image = program.context?.image?.portrait;
    expect(image).toBeDefined();
    expect(image.data).toBeUndefined();
    expect(image.src).toBe("/file:/local/assets/portrait.svg?v=1");
  });
});

describe("filterImage URL fallback", () => {
  const makeContext = (image: Record<string, unknown>) => ({
    image: { portrait: { $type: "image", $name: "portrait", ...image } },
    filtered_image: {
      p: {
        $type: "filtered_image",
        $name: "p",
        image: { $type: "image", $name: "portrait" },
        filters: [{ $type: "filter", $name: "f" }],
      } as any,
    },
    filter: { f: { includes: [""], excludes: ["hat"] } },
  });

  it("builds an on-demand URL when the root has no data (stripped host)", () => {
    const context = makeContext({
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
    });
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toMatch(
      /^\/file:\/local\/assets\/portrait\.svg\?v=1&filters=/,
    );
  });

  it("still filters inline when data is present (unstripped host)", () => {
    const context = makeContext({
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
      data: `data:image/svg+xml,${SVG}`,
    });
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toMatch(
      /^data:image\/svg\+xml,/,
    );
    expect(context.filtered_image.p.filtered_src).not.toContain("hat");
  });

  it("falls back to the plain root src for a no-op filter", () => {
    const context = makeContext({
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
    });
    (context.filter.f as any) = { includes: [""], excludes: [] };
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toBe(
      "/file:/local/assets/portrait.svg?v=1",
    );
  });
});

describe("getOrCreateFilteredSvg", () => {
  const makeCache = () => {
    const store = new Map<string, Response>();
    return {
      store,
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, response: Response) => {
        store.set(key, response);
      },
      delete: async (key: string) => store.delete(key),
      keys: async () => Array.from(store.keys()).map((url) => ({ url })),
    };
  };

  const svgFile = (lastModified: number): FilteredSvgFile =>
    Object.assign(new Blob([SVG], { type: "image/svg+xml" }), {
      lastModified,
    }) as FilteredSvgFile;

  const PARAM = serializeImageFilterParam({ includes: [""], excludes: ["hat"] })!;

  it("filters, serves image/svg+xml, and caches by signature", async () => {
    const cache = makeCache();
    const first = await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    expect(first).toBeDefined();
    expect(first!.headers.get("Content-Type")).toBe("image/svg+xml");
    const text = await first!.text();
    expect(text).not.toContain("filter hat");
    expect(text).toContain("filter default body");
    expect(cache.store.size).toBe(1);

    const second = await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    expect(second).toBeDefined();
    expect(cache.store.size).toBe(1);
  });

  it("prunes superseded signatures of the same variant on regeneration", async () => {
    const cache = makeCache();
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(222), // the file was edited
      PARAM,
    );
    // Pruning runs AFTER the response, off the critical path — `cache.keys()`
    // enumerates the whole bucket and warming generates the project's entire
    // variant set, so on the critical path that is O(n^2) on the thread serving
    // the image the user is waiting for.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.store.size).toBe(1);
    expect(Array.from(cache.store.keys())[0]).toContain("sig=222-");
  });

  it("serves the unfiltered original for garbage or no-op params", async () => {
    const cache = makeCache();
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        svgFile(111),
        "not json",
      ),
    ).toBeUndefined();
    const noop = serializeImageFilterParam({ includes: [""], excludes: [] });
    expect(noop).toBeUndefined();
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        svgFile(111),
        '{"i":"off","e":[]}',
      ),
    ).toBeUndefined();
    expect(cache.store.size).toBe(0);
  });

  it("runs ONE generation for concurrent requests of the same variant", async () => {
    // Showing an image asks for the variant twice at once (element
    // `background-image` + the hidden <img> child `UIModule.createImage` adds),
    // and a preload can race both. Each miss used to do its own read + filter
    // + prune, so a first display paid the work 2-3x (#344).
    const cache = makeCache();
    let reads = 0;
    const counted = (lastModified: number): FilteredSvgFile => {
      const blob = svgFile(lastModified);
      return Object.assign(blob, {
        text: async () => {
          reads += 1;
          // Yield, so the second caller definitely arrives mid-generation.
          await Promise.resolve();
          return SVG;
        },
      }) as FilteredSvgFile;
    };
    const responses = await Promise.all([
      getOrCreateFilteredSvg(cache, "local/assets/portrait.svg", counted(111), PARAM),
      getOrCreateFilteredSvg(cache, "local/assets/portrait.svg", counted(111), PARAM),
      getOrCreateFilteredSvg(cache, "local/assets/portrait.svg", counted(111), PARAM),
    ]);
    expect(reads).toBe(1);
    expect(cache.store.size).toBe(1);
    // Distinct, independently readable responses. (This does NOT distinguish a
    // fresh Response from a `clone()` — clones are distinct and readable too.
    // Why the implementation avoids clone() is a browser-only stall that no
    // Node test can observe; see the note on `filteredSvgResponse`.)
    expect(new Set(responses).size).toBe(3);
    const texts = await Promise.all(responses.map((r) => r!.text()));
    for (const text of texts) {
      expect(text).toContain("filter default body");
      expect(text).not.toContain("filter hat");
    }
    // ...and the stored entry is still independently readable afterwards.
    const stored = Array.from(cache.store.values())[0]!;
    expect(await stored.clone().text()).toContain("filter default body");
  });

  it("lets a caller regenerate when the generation it shared failed", async () => {
    // Sharing must never turn ONE transient read failure into every concurrent
    // caller serving unfiltered art: `sw.ts` treats `undefined` as "serve the
    // original", which draws every filter-tagged node.
    const cache = makeCache();
    let attempt = 0;
    const flaky = (): FilteredSvgFile =>
      Object.assign(svgFile(111), {
        text: async () => {
          attempt += 1;
          await Promise.resolve();
          if (attempt === 1) {
            throw new Error("read failed");
          }
          return SVG;
        },
      }) as FilteredSvgFile;
    const [first, second] = await Promise.all([
      getOrCreateFilteredSvg(cache, "local/assets/portrait.svg", flaky(), PARAM),
      getOrCreateFilteredSvg(cache, "local/assets/portrait.svg", flaky(), PARAM),
    ]);
    // One of the two owned the failing generation; the other must not have
    // inherited it.
    const survivors = [first, second].filter(Boolean);
    expect(survivors).toHaveLength(1);
    expect(await survivors[0]!.text()).toContain("filter default body");
    expect(cache.store.size).toBe(1);
  });

  it("does not strand a failed generation for later callers", async () => {
    const cache = makeCache();
    const exploding = Object.assign(svgFile(111), {
      text: async () => {
        throw new Error("read failed");
      },
    }) as FilteredSvgFile;
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        exploding,
        PARAM,
      ),
    ).toBeUndefined();
    // The key must be released, or the variant can never be generated again.
    const recovered = await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    expect(recovered).toBeDefined();
    expect(await recovered!.text()).toContain("filter default body");
  });

  it("shares one cache entry across non-canonical spellings of the same filter", async () => {
    const cache = makeCache();
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      JSON.stringify({ i: "off", e: ["hat", "hat"] }),
    );
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      JSON.stringify({ i: "off", e: ["hat"] }),
    );
    expect(cache.store.size).toBe(1);
  });
});

// #299/#479: filtered images resolve to on-demand `?attributes=` URLs (service-worker
// generated, signature-cached) instead of the program embedding every SVG's
// source. These tests pin the three seams: the compiler strip (opt-in,
// per-host), filterImage's URL fallback when a root carries no data, and the
// shared cached generator both service workers delegate to.

import { describe, expect, it } from "vitest";
import { buildSVGAttributeVocabulary, decodeSVGSource } from "../../attributes";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { filterImage } from "../../compiler/utils/filterImage";
import {
  getOrCreateFilteredSvg,
  serializeImageFilterParam,
  type FilteredSvgFile,
} from "../../filters/filteredSvg";

const MAIN_URI = "file://proj/main.sd";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='hat' data-name='hat.on'><path/></g><g id='gloves' data-name='gloves.on'><path/></g><g id='body'><path/></g></svg>`;
const VOCABULARY = buildSVGAttributeVocabulary(SVG);

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
    // Falsy, not strictly undefined: the `image` type's `$default` declares
    // `data = ""`, so default-inheritance refills the stripped field with an
    // empty string. What #299 requires is that the PAYLOAD is gone.
    expect(image.data).toBeFalsy();
    expect(image.src).toBe("/file:/local/assets/portrait.svg?v=1");
  });
});

describe("filterImage URL fallback", () => {
  const makeContext = (image: Record<string, unknown>) => ({
    image: {
      portrait: {
        $type: "image",
        $name: "portrait",
        attribute_vocabulary: VOCABULARY,
        ...image,
      },
    },
    filtered_image: {
      p: {
        $type: "filtered_image",
        $name: "p",
        image: { $type: "image", $name: "portrait" },
        attributes: ["hat.off"],
      } as any,
    },
  });

  it("builds an on-demand URL when the root has no data (stripped host)", () => {
    const context = makeContext({
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
    });
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toMatch(
      /^\/file:\/local\/assets\/portrait\.svg\?v=1&attributes=/,
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
    expect(
      decodeSVGSource(context.filtered_image.p.filtered_src),
    ).not.toContain("hat");
    expect(decodeSVGSource(context.filtered_image.p.filtered_src)).toContain(
      "id='body'",
    );
  });

  it("requests the resting variant when the attribute list is empty", () => {
    const context = makeContext({
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
    });
    context.filtered_image.p.attributes = [];
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toBe(
      "/file:/local/assets/portrait.svg?v=1&attributes=%7B%7D",
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

  const PARAM = serializeImageFilterParam({ hat: "off" })!;

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
    expect(text).not.toContain("id='hat'");
    expect(text).toContain("id='body'");
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

  it("serves correctly filtered art when cache lookup rejects", async () => {
    const cache = makeCache();
    cache.match = async () => {
      throw new DOMException("Cache storage unavailable", "InvalidStateError");
    };
    const response = await getOrCreateFilteredSvg(
      cache,
      "local/assets/lookup-failure.svg",
      svgFile(111),
      PARAM,
    );
    expect(response).toBeDefined();
    const text = await response!.text();
    expect(text).toContain("id='body'");
    expect(text).not.toContain("id='hat'");
    expect(cache.store.size).toBe(1);
  });

  it("shares the filtered art when cache writes reject without retrying the file read", async () => {
    const cache = makeCache();
    cache.put = async () => {
      throw new DOMException("Entry already exists", "InvalidAccessError");
    };
    let reads = 0;
    const file = Object.assign(svgFile(111), {
      text: async () => {
        reads++;
        await Promise.resolve();
        return SVG;
      },
    }) as FilteredSvgFile;
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        getOrCreateFilteredSvg(
          cache,
          "local/assets/write-failure.svg",
          file,
          PARAM,
        ),
      ),
    );
    expect(responses.every(Boolean)).toBe(true);
    expect(reads).toBe(1);
    expect(new Set(responses).size).toBe(3);
    for (const response of responses) {
      expect(response!.headers.get("Content-Type")).toBe("image/svg+xml");
      const text = await response!.text();
      expect(text).toContain("id='body'");
      expect(text).not.toContain("id='hat'");
    }
    expect(cache.store.size).toBe(0);
    // The failed persistence must not strand the finished in-flight entry.
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/write-failure.svg",
        file,
        PARAM,
      ),
    ).toBeDefined();
    expect(reads).toBe(2);
  });

  it("does not prune the prior cached signature when storing its replacement fails", async () => {
    const cache = makeCache();
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/prune-write-failure.svg",
      svgFile(111),
      PARAM,
    );
    cache.put = async () => {
      throw new DOMException("Entry already exists", "InvalidAccessError");
    };
    const response = await getOrCreateFilteredSvg(
      cache,
      "local/assets/prune-write-failure.svg",
      svgFile(222),
      PARAM,
    );
    expect(response).toBeDefined();
    expect(await response!.text()).not.toContain("id='hat'");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.store.size).toBe(1);
    expect([...cache.store.keys()][0]).toContain("sig=111-");
  });

  it("falls back for garbage params but generates the empty selection's resting layers", async () => {
    const cache = makeCache();
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        svgFile(111),
        "not json",
      ),
    ).toBeUndefined();
    expect(
      await getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        svgFile(111),
        '{"i":"off","e":[]}',
      ),
    ).toBeUndefined();
    expect(cache.store.size).toBe(0);
    const resting = await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      serializeImageFilterParam({})!,
    );
    expect(resting).toBeDefined();
    const text = await resting!.text();
    expect(text).toContain("id='body'");
    expect(text).not.toContain("id='hat'");
    expect(cache.store.size).toBe(1);
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
      getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        counted(111),
        PARAM,
      ),
      getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        counted(111),
        PARAM,
      ),
      getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        counted(111),
        PARAM,
      ),
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
      expect(text).toContain("id='body'");
      expect(text).not.toContain("id='hat'");
    }
    // ...and the stored entry is still independently readable afterwards.
    const stored = Array.from(cache.store.values())[0]!;
    expect(await stored.clone().text()).toContain("id='body'");
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
      getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        flaky(),
        PARAM,
      ),
      getOrCreateFilteredSvg(
        cache,
        "local/assets/portrait.svg",
        flaky(),
        PARAM,
      ),
    ]);
    // One of the two owned the failing generation; the other must not have
    // inherited it.
    const survivors = [first, second].filter(Boolean);
    expect(survivors).toHaveLength(1);
    expect(await survivors[0]!.text()).toContain("id='body'");
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
    expect(await recovered!.text()).toContain("id='body'");
  });

  it("serves the filtered art when the cache refuses to store it (#477)", async () => {
    // A rejected `cache.put` is a STORAGE failure, not a filtering failure:
    // the markup is already in hand. Discarding it makes `sw.ts` fall through
    // to the unfiltered original, which draws every filter-tagged node at once
    // (both eye directions, both arms) with a 200 and nothing logged. Failing
    // to memoise must cost a cache hit, not the picture.
    const cache = makeCache();
    const refusing = {
      ...cache,
      put: async () => {
        throw new Error(
          "Failed to execute 'put' on 'Cache': Entry already exists.",
        );
      },
    };
    const first = await getOrCreateFilteredSvg(
      refusing,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    expect(first).toBeDefined();
    expect(first!.headers.get("Content-Type")).toBe("image/svg+xml");
    const text = await first!.text();
    expect(text).not.toContain("id='hat'");
    expect(text).toContain("id='body'");
    expect(cache.store.size).toBe(0);
    // Nothing was memoised, so the next request must generate again rather
    // than find a stranded in-flight key and give up.
    const second = await getOrCreateFilteredSvg(
      refusing,
      "local/assets/portrait.svg",
      svgFile(111),
      PARAM,
    );
    expect(second).toBeDefined();
    expect(await second!.text()).not.toContain("id='hat'");
  });

  it("hands every concurrent caller filtered art when the cache refuses (#477)", async () => {
    // The waiters read the shared generation's result, so a rejection inside
    // it turns one storage failure into unfiltered art for all of them at once.
    const cache = makeCache();
    const refusing = {
      ...cache,
      put: async () => {
        throw new Error("QuotaExceededError");
      },
    };
    const counted = (): FilteredSvgFile =>
      Object.assign(svgFile(111), {
        text: async () => {
          await Promise.resolve();
          return SVG;
        },
      }) as FilteredSvgFile;
    const responses = await Promise.all([
      getOrCreateFilteredSvg(
        refusing,
        "local/assets/portrait.svg",
        counted(),
        PARAM,
      ),
      getOrCreateFilteredSvg(
        refusing,
        "local/assets/portrait.svg",
        counted(),
        PARAM,
      ),
      getOrCreateFilteredSvg(
        refusing,
        "local/assets/portrait.svg",
        counted(),
        PARAM,
      ),
    ]);
    for (const response of responses) {
      expect(response).toBeDefined();
      const text = await response!.text();
      expect(text).toContain("id='body'");
      expect(text).not.toContain("id='hat'");
    }
  });

  it("shares one cache entry across non-canonical spellings of the same filter", async () => {
    const cache = makeCache();
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      JSON.stringify({ hat: "off", gloves: "off" }),
    );
    await getOrCreateFilteredSvg(
      cache,
      "local/assets/portrait.svg",
      svgFile(111),
      JSON.stringify({ gloves: "off", hat: "off" }, null, 2),
    );
    expect(cache.store.size).toBe(1);
  });
});

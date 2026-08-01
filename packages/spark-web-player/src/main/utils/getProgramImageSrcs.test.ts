// #344: a filtered image is displayed through `<root>?v=<sig>&filters=<canonical>`,
// a url NOTHING else fetches. Warming the root asset therefore leaves the url
// the renderer actually asks for cold, and the element paints blank for the
// length of that fetch. These tests pin that the warm set contains the
// DISPLAYED url, not just the root one.

import { UIModule } from "@impower/spark-engine/src/game/modules/ui/classes/UIModule";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { getProgramImageSrcs } from "./getProgramImageSrcs";

/**
 * The engine's real resolution path, without booting a Game (same technique as
 * spark-engine's FilteredLayeredImage.test.ts).
 */
class ProbeUIModule extends UIModule {
  constructor(context: any) {
    super({} as any);
    (this as any)._context = context;
    Object.defineProperty(this, "context", {
      get: () => context,
      configurable: true,
    });
  }
}

const MAIN_URI = "file://proj/main.sd";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='filter hat'><path/></g><g id='filter default body'><path/></g></svg>`;

const BUNNY_SRC = "/file:/local/assets/bunny.svg?v=11-2200";
const ROOM_SRC = "/file:/local/assets/room.png?v=22-3300";

/**
 * A real filter definition, in the shape the R&B project uses. Without one, a
 * `~hat` reference resolves to the SAME empty-filter param as the implicit
 * whole-asset variant — i.e. the same url — and any test about the two is
 * silently comparing a value with itself.
 */
const HAT_FILTER = `define hat as filter with
  includes = {
    "",
  }
  excludes = {
    "hat",
  }
end

`;

/** Compile a one-script project the way the player's workspace does (#299). */
const compileProject = (script: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    stripImageData: true,
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: script,
        version: 1,
        languageId: "sparkdown",
      },
      {
        uri: "file://proj/assets/bunny.svg",
        type: "image",
        name: "bunny",
        ext: "svg",
        src: BUNNY_SRC,
        text: SVG,
      },
      {
        uri: "file://proj/assets/room.png",
        type: "image",
        name: "room",
        ext: "png",
        src: ROOM_SRC,
      },
    ] as any,
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program as any;
};

describe("getProgramImageSrcs", () => {
  it("warms the FILTERED url an svg is displayed through, not only its root src", () => {
    const program = compileProject(`[[show backdrop bunny]]\n`);
    const srcs = getProgramImageSrcs(program.context);

    // The compiler declares an implicit filtered_image for every svg, so even
    // a plain reference renders through a variant url.
    const variant = srcs.find((src) => src.includes("&filters="));
    expect(variant).toMatch(
      /^\/file:\/local\/assets\/bunny\.svg\?v=11-2200&filters=/,
    );
    // The bug, stated: warming the root is NOT warming what gets displayed.
    expect(variant).not.toEqual(BUNNY_SRC);
    // The root is still worth warming — layers of a layered_image, and raster
    // and remote assets, all render through it.
    expect(srcs).toContain(BUNNY_SRC);
  });

  it("never writes back to the program", () => {
    // `filterImage` memoizes by writing `filtered_src` onto the struct it is
    // handed, and the player gives the GAME that very object. Resolving in
    // place would let a warm-up decide what the game renders — and decide it
    // differently, since `Game.applyBuiltinDefaults` fills a filter's
    // unauthored includes/excludes from `$default` and this sweep does not.
    const program = compileProject(`[[show backdrop bunny]]\n`);
    const before = JSON.stringify(program.context);
    const srcs = getProgramImageSrcs(program.context);
    expect(srcs.some((src) => src.includes("&filters="))).toBe(true);
    expect(JSON.stringify(program.context)).toEqual(before);
    expect(program.context.filtered_image.bunny.filtered_src).toBeUndefined();
  });

  it("puts filtered variants ahead of root srcs in the warm order", () => {
    const program = compileProject(`[[show backdrop bunny]]\n`);
    const srcs = getProgramImageSrcs(program.context);
    const variant = srcs.find((src) => src.includes("&filters="))!;
    expect(srcs).toContain(BUNNY_SRC);
    expect(srcs.indexOf(variant)).toBeLessThan(srcs.indexOf(BUNNY_SRC));
  });

  it("warms raster assets, which have no variant url", () => {
    const program = compileProject(`[[show backdrop room]]\n`);
    const srcs = getProgramImageSrcs(program.context);
    expect(srcs).toContain(ROOM_SRC);
  });

  it("warms the variant of a `~`-tagged reference, filter and all", () => {
    const program = compileProject(
      `${HAT_FILTER}[[show portrait bunny~hat]]\n`,
    );
    expect(program.context.filtered_image["bunny~hat"]).toBeDefined();
    const srcs = getProgramImageSrcs(program.context);
    const variant = srcs.find((src) =>
      decodeURIComponent(src).includes('"hat"'),
    )!;
    // Not merely "a variant url" — the one that encodes THIS filter.
    expect(variant).toMatch(/^\/file:\/local\/assets\/bunny\.svg\?v=11-2200&/);
  });

  it("warms `~`-tagged variants BEFORE the implicit whole-asset ones", () => {
    // `populateImplicitDefs` declares one implicit filtered_image per svg
    // before it declares the `~`-tagged ones the scripts reference, so warming
    // in map order buries every referenced variant behind one entry per asset
    // in the project — 78 ahead of the portrait #344 is about, on the real
    // project, at a concurrency of 6.
    const program = compileProject(
      `${HAT_FILTER}[[show backdrop bunny]]\n[[show portrait bunny~hat]]\n`,
    );
    expect(program.context.filter.hat.excludes).toEqual(["hat"]);
    const srcs = getProgramImageSrcs(program.context);
    const variants = srcs.filter((src) => src.includes("&filters="));
    const tagged = variants.find((src) =>
      decodeURIComponent(src).includes('"hat"'),
    )!;
    const implicit = variants.find((src) => src !== tagged)!;
    expect(tagged).toBeDefined();
    expect(implicit).toBeDefined();
    expect(srcs.indexOf(tagged)).toBeLessThan(srcs.indexOf(implicit));
  });

  it("warms every src the ENGINE's own resolution path asks for", () => {
    // The invariant the whole change rests on: everything
    // `UIModule.getImageSrcsByName` (the ACTUAL display path, with its
    // `sortFilteredName` canonicalization and its layered fallback) asks for is
    // in the warm set. Compiled twice so the two resolutions run over
    // independent structs and neither can pass by reading the other's memo.
    const script = `${HAT_FILTER}[[show backdrop bunny]]\n[[show portrait bunny~hat]]\n[[show backdrop room]]\n`;
    const warmed = new Set(getProgramImageSrcs(compileProject(script).context));
    const fresh = compileProject(script);
    const ui = new ProbeUIModule(fresh.context);

    const names = [
      ...Object.keys(fresh.context.filtered_image ?? {}),
      ...Object.keys(fresh.context.image ?? {}),
    ];
    const requested = names.flatMap((name) => ui.getImageSrcsByName(name) ?? []);

    expect(requested.length).toBeGreaterThan(0);
    expect(requested.some((src: string) => src.includes("&filters="))).toBe(
      true,
    );
    for (const src of requested) {
      expect(Array.from(warmed)).toContain(src);
    }
  });

  describe("resolution rules", () => {
    const makeContext = (
      image: Record<string, unknown>,
      filters: unknown[] = [{ $type: "filter", $name: "f" }],
    ) => ({
      image: { bunny: { $type: "image", $name: "bunny", ...image } },
      filtered_image: {
        b: {
          $type: "filtered_image",
          $name: "b",
          image: { $type: "image", $name: "bunny" },
          filters,
        } as any,
      },
      filter: { f: { includes: [""], excludes: ["hat"] } },
    });

    it("resolves a named filter to a `filters=` url", () => {
      const context = makeContext({ ext: "svg", src: BUNNY_SRC });
      const srcs = getProgramImageSrcs(context);
      expect(srcs[0]).toMatch(/^\/file:\/local\/assets\/bunny\.svg\?v=11-2200&filters=/);
      expect(srcs[0]).toContain(encodeURIComponent('"e":["hat"]'));
      expect(context.filtered_image.b.filtered_src).toBeUndefined();
    });

    it("skips inlined-svg hosts, whose variants are data: uris", () => {
      const context = makeContext({
        ext: "svg",
        src: BUNNY_SRC,
        data: `data:image/svg+xml,${SVG}`,
      });
      const srcs = getProgramImageSrcs(context);
      // Nothing to fetch, so nothing to warm — and crucially the svg was never
      // parsed and rewritten just to find that out.
      expect(context.filtered_image.b.filtered_src).toBeUndefined();
      expect(srcs).toEqual([BUNNY_SRC]);
    });

    it("skips inlined-svg hosts through a CHAINED root too", () => {
      // `filtered_image.image` can name another filtered_image. A one-hop
      // lookup misses that, sending the struct into filterImage's inline
      // branch — a full parse + rewrite of the svg, on every compile, to
      // produce a data: uri nobody warms.
      const context: any = {
        image: {
          bunny: {
            $type: "image",
            $name: "bunny",
            ext: "svg",
            src: BUNNY_SRC,
            data: `data:image/svg+xml,${SVG}`,
          },
        },
        filtered_image: {
          once: {
            $type: "filtered_image",
            $name: "once",
            image: { $type: "image", $name: "bunny" },
            filters: [{ $type: "filter", $name: "f" }],
          },
          twice: {
            $type: "filtered_image",
            $name: "twice",
            image: { $type: "filtered_image", $name: "once" },
            filters: [{ $type: "filter", $name: "f" }],
          },
        },
        filter: { f: { includes: [""], excludes: ["hat"] } },
      };
      const srcs = getProgramImageSrcs(context);
      expect(context.filtered_image.once.filtered_src).toBeUndefined();
      expect(context.filtered_image.twice.filtered_src).toBeUndefined();
      expect(srcs).toEqual([BUNNY_SRC]);
    });

    it("does not loop on a self-referential root chain", () => {
      const context: any = {
        image: {},
        filtered_image: {
          a: {
            $type: "filtered_image",
            $name: "a",
            image: { $type: "filtered_image", $name: "b" },
            filters: [],
          },
          b: {
            $type: "filtered_image",
            $name: "b",
            image: { $type: "filtered_image", $name: "a" },
            filters: [],
          },
        },
        filter: {},
      };
      expect(getProgramImageSrcs(context)).toEqual([]);
    });

    it("covers a layered root through its layers", () => {
      const context: any = {
        image: {
          body: { $type: "image", $name: "body", src: "/file:/a.svg?v=1" },
          hat: { $type: "image", $name: "hat", src: "/file:/b.svg?v=1" },
        },
        layered_image: {
          bunny: {
            $type: "layered_image",
            $name: "bunny",
            assets: {
              "default body": { $type: "image", $name: "body" },
              "filter hat": { $type: "image", $name: "hat" },
            },
          },
        },
        filtered_image: {
          b: {
            $type: "filtered_image",
            $name: "b",
            image: { $type: "layered_image", $name: "bunny" },
            filters: [{ $type: "filter", $name: "f" }],
          },
        },
        filter: { f: { includes: [""], excludes: ["hat"] } },
      };
      const srcs = getProgramImageSrcs(context);
      // A layered root has no single flattened src; the surviving layers are
      // plain `image` structs and must still all be warmed.
      expect(context.filtered_image.b.filtered_src).toBeUndefined();
      expect(srcs).toContain("/file:/a.svg?v=1");
      expect(srcs).toContain("/file:/b.svg?v=1");
    });

    it("returns nothing for an absent context", () => {
      expect(getProgramImageSrcs(undefined)).toEqual([]);
      expect(getProgramImageSrcs({})).toEqual([]);
    });
  });
});

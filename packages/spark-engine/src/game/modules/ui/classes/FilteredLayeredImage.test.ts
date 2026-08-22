// Side-effect import FIRST: the inkjs engine has a Container↔Value↔Object
// module cycle, and importing UIModule cold lets Object.ts load first, which
// makes `Container extends InkObject` see undefined. Priming Container fixes
// the load order (same pattern as compileSnapshot.ts).
import "@impower/sparkdown/src/inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { UIModule } from "./UIModule";

/**
 * #302: a `filtered_image` whose root is a `layered_image` resolves to the
 * SUBSET of layers the filter leaves behind, not to a single flattened src.
 *
 * `getImageSrcsByName` used to check only `filtered_src` -- which the layered
 * branch of `filterImage` never sets -- then fall through to lookups keyed by
 * the FILTERED name, miss both, and return null. So a filtered layered image
 * drew nothing at all, and the layer set the compiler computed had no reader
 * on this path.
 */

/** Exposes the resolution path under test without booting a Game. */
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

const image = (name: string) => ({
  $type: "image",
  $name: name,
  src: `/file:/local/assets/${name}.png?v=1`,
});

/** The shape the compiler emits: bare references carry `$type: ""`. */
const ref = (name: string) => ({ $type: "", $name: name });

const context = {
  filter: {
    hat_filter: { $type: "filter", $name: "hat_filter", includes: [""], excludes: ["hat"] },
  },
  image: {
    portrait__hat: image("portrait__hat"),
    portrait__body: image("portrait__body"),
  },
  layered_image: {
    portrait: {
      $type: "layered_image",
      $name: "portrait",
      assets: {
        "filter hat": ref("portrait__hat"),
        "filter default body": ref("portrait__body"),
      },
    },
  },
  filtered_image: {
    p: {
      $type: "filtered_image",
      $name: "p",
      image: ref("portrait"),
      filters: [ref("hat_filter")],
    },
  },
};

describe("filtered image over a layered root", () => {
  it("resolves to the surviving layers instead of nothing", () => {
    const ui = new ProbeUIModule(structuredClone(context));
    expect(ui.getImageSrcsByName("p")).toEqual([
      "/file:/local/assets/portrait__body.png?v=1",
    ]);
  });

  it("still resolves a plain layered image unfiltered", () => {
    const ui = new ProbeUIModule(structuredClone(context));
    expect(ui.getImageSrcsByName("portrait")).toEqual([
      "/file:/local/assets/portrait__hat.png?v=1",
      "/file:/local/assets/portrait__body.png?v=1",
    ]);
  });

  it("terminates when a layer points back at the filtered image", () => {
    // `portrait` lists `p` as a layer, and `p` filters `portrait` -- authorable,
    // and the untyped fan-out re-enters getImageAssets, so an unguarded
    // recursion blows the stack instead of rendering a missing image.
    const cyclic = structuredClone(context) as any;
    cyclic.layered_image.portrait.assets = { 0: ref("p") };
    const ui = new ProbeUIModule(cyclic);
    expect(() => ui.getImageSrcsByName("p")).not.toThrow();
  });

  it("keeps a surviving layer that is itself a group", () => {
    // Layers are bare references carrying an empty `$type`, and one can name a
    // layered_image rather than an image -- resolving them with a direct
    // `context.image` lookup drops the whole group.
    const nested = structuredClone(context) as any;
    nested.image.eyes__open = image("eyes__open");
    nested.image.eyes__brow = image("eyes__brow");
    nested.layered_image.eyes = {
      $type: "layered_image",
      $name: "eyes",
      assets: { 0: ref("eyes__open"), 1: ref("eyes__brow") },
    };
    nested.layered_image.portrait.assets["filter default eyes"] = ref("eyes");

    expect(nested.filtered_image.p).toBeDefined();
    expect(new ProbeUIModule(nested).getImageSrcsByName("p")).toEqual([
      "/file:/local/assets/portrait__body.png?v=1",
      "/file:/local/assets/eyes__open.png?v=1",
      "/file:/local/assets/eyes__brow.png?v=1",
    ]);
  });
});

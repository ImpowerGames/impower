import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";

/**
 * Does this filtered image resolve to inlined SVG source?
 *
 * `filtered_image.image` can name another `filtered_image` (`a` filtered by one
 * filter, then filtered again), so a one-hop lookup misses chained roots —
 * which would send them into `filterImage`'s parse-and-rewrite branch to
 * produce a `data:` uri nobody warms. Walks the chain the way
 * `filterImage`'s own `getRootImage` does, with the same cycle guard.
 */
const rootHasInlinedData = (
  context: { [type: string]: { [name: string]: any } },
  filteredImage: any,
): boolean => {
  const seen = new Set<string>();
  let name = filteredImage?.["image"]?.["$name"];
  while (typeof name === "string" && !seen.has(name)) {
    seen.add(name);
    const image = context["image"]?.[name];
    if (image) {
      return !!image["data"];
    }
    const nested = context["filtered_image"]?.[name];
    if (!nested) {
      // A layered root (or nothing at all) — neither carries inlined source
      // that `filterImage` would have to parse.
      return false;
    }
    name = nested["image"]?.["$name"];
  }
  return false;
};

/**
 * Every image URL a compiled program will make the renderer request, ordered by
 * how likely it is that the user reaches it first.
 *
 * The order is load-bearing, not cosmetic. `populateImplicitDefs` declares a
 * `filtered_image` for EVERY svg asset before it declares the `~`-tagged ones
 * the scripts actually reference, so warming in map order buries the referenced
 * variants behind one entry per asset in the project — on the real project
 * that is ~78 whole-asset variants ahead of the ~268 the script asks for, and
 * the portrait #344 is about ends up near the back. So:
 *
 *   1. `~`-tagged variants — these exist only because a script references them.
 *   2. bare implicit variants — one per svg, referenced or not.
 *   3. root srcs — what raster and remote assets render through.
 *
 * A filtered image renders through `<root>?v=<sig>&filters=<canonical>`, a URL
 * nothing else ever fetches, so warming the root asset instead leaves the
 * variant cold and the element paints blank for the length of the fetch (#344).
 * Note that this is not only the `~`-tagged references: an empty filter still
 * serializes to a `filters=` param, so plain `[[show portrait bunny]]` goes
 * through a variant URL too.
 *
 * Resolution mirrors `UIModule.getImageSrcsByName` by calling the same
 * `filterImage` — but on COPIES of the structs, never the program's own.
 * `filterImage` memoizes by writing `filtered_src` back onto the struct it is
 * given, and the player hands the game that very object (`Game` shallow-spreads
 * `program.context`, so the per-type records are shared). Memoizing from here
 * would therefore let a warm-up decide what the game renders — and it would
 * decide it differently, because `Game.applyBuiltinDefaults` fills a `filter`'s
 * unauthored `includes`/`excludes` from `$default` and this sweep runs against
 * the raw compiled structs. For `define f as filter end` those disagree: `[]`
 * removes every filterable non-`default` node, `[""]` removes nothing. A
 * warm-up must never be able to change a pixel, so it resolves in its own
 * scratch space and the engine keeps computing its own answer.
 */
export const getProgramImageSrcs = (
  context: { [type: string]: { [name: string]: any } } | undefined,
): string[] => {
  const tagged: string[] = [];
  const implicit: string[] = [];
  const roots: string[] = [];
  if (!context) {
    return roots;
  }
  const images = context["image"];
  const filteredImages = context["filtered_image"];
  if (filteredImages) {
    for (const [name, filteredImage] of Object.entries(filteredImages)) {
      if (rootHasInlinedData(context, filteredImage)) {
        // Hosts that keep the SVG source inlined resolve variants to a `data:`
        // URI: nothing to fetch, and building one means parsing and rewriting
        // the whole SVG. Don't pay that to warm nothing.
        continue;
      }
      // The copy is the whole point — see the note above. It is shallow, which
      // is enough: `filterImage` only ever writes `filtered_src` and
      // `filtered_layers` at the top level.
      const scratch = { ...filteredImage };
      filterImage(context, scratch);
      const src = scratch["filtered_src"];
      if (typeof src === "string") {
        (name.includes("~") ? tagged : implicit).push(src);
      }
      // A LAYERED root yields `filtered_layers` instead of one flattened src.
      // Those layers are plain `image` structs, so the sweep below covers them.
    }
  }
  if (images) {
    for (const image of Object.values(images)) {
      const src = image?.["src"];
      if (typeof src === "string") {
        roots.push(src);
      }
    }
  }
  return [...tagged, ...implicit, ...roots];
};

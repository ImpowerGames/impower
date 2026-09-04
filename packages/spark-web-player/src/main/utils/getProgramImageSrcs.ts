import { resolveImageSrcs } from "./resolveImageSrcs";

/**
 * Every image URL a compiled program will make the renderer request, ordered by
 * how likely it is that the user reaches it first.
 *
 * The order is load-bearing, not cosmetic. `populateImplicitDefs` declares a
 * `filtered_image` for EVERY svg asset before it declares the `~`-tagged ones
 * the scripts actually reference, so resolving in map order buries the
 * referenced variants behind one entry per asset in the project — on the real
 * project that is ~78 whole-asset variants ahead of the ~268 the script asks
 * for, and the portrait #344 is about ends up near the back. So:
 *
 *   1. `~`-tagged variants — these exist only because a script references them.
 *   2. bare implicit variants — one per svg, referenced or not.
 *   3. root srcs — what raster and remote assets render through.
 *
 * Resolution itself is `resolveImageSrcs`, shared with the per-scene
 * prefetch, and never writes back to the program.
 */
export const getProgramImageSrcs = (
  context: { [type: string]: { [name: string]: any } } | undefined,
): string[] => {
  if (!context) {
    return [];
  }
  const filteredNames = Object.keys(context["filtered_image"] ?? {});
  const tagged = filteredNames.filter((name) => name.includes("~"));
  const implicit = filteredNames.filter((name) => !name.includes("~"));
  const srcs = resolveImageSrcs(context, [...tagged, ...implicit]);
  // Root srcs by struct, not by name: an svg's root NAME resolves to its
  // implicit variant, while the root url itself is what layers, raster, and
  // remote assets render through.
  const seen = new Set(srcs);
  for (const image of Object.values(context["image"] ?? {})) {
    const src = image?.["src"];
    if (typeof src === "string" && src && !seen.has(src)) {
      seen.add(src);
      srcs.push(src);
    }
  }
  return srcs;
};

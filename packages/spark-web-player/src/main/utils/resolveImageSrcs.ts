import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";

type Context = { [type: string]: { [name: string]: any } };

/**
 * Does this filtered image resolve to inlined SVG source?
 *
 * `filtered_image.image` can name another `filtered_image` (`a` filtered by one
 * filter, then filtered again), so a one-hop lookup misses chained roots —
 * which would send them into `filterImage`'s parse-and-rewrite branch to
 * produce a `data:` uri nobody warms. Walks the chain the way
 * `filterImage`'s own `getRootImage` does, with the same cycle guard.
 */
export const rootHasInlinedData = (
  context: Context,
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

const imageSrcOf = (context: Context, ref: unknown): string | undefined => {
  if (!ref || typeof ref !== "object") {
    return undefined;
  }
  const r = ref as Record<string, unknown>;
  if (typeof r["src"] === "string") {
    return r["src"];
  }
  const name = r["$name"];
  if (typeof name !== "string") {
    return undefined;
  }
  const image = context["image"]?.[name];
  return typeof image?.["src"] === "string" ? image["src"] : undefined;
};

/**
 * The URLs the renderer will request for these image names, as authored
 * (`~`-tagged names allowed), in first-use order and without duplicates.
 *
 * Resolution mirrors `UIModule.getImageSrcsByName` by calling the same
 * `filterImage` — but on COPIES of the structs, never the program's own.
 * `filterImage` memoizes by writing `filtered_src` back onto the struct it is
 * given, so memoizing from here would let a warm-up decide what the game
 * renders — and it could decide it differently, because the game resolves
 * `filter` defines through its RUNTIME channel (the `__def` inheritance
 * chain fills a `filter`'s unauthored `includes`/`excludes`) while this
 * sweep runs against the compiled `program.context` structs. For
 * `define f as filter end` those can disagree: `[]` removes every filterable
 * non-`default` node, `[""]` removes nothing. A warm-up must never be able
 * to change a pixel, so it resolves in its own scratch space and the engine
 * keeps computing its own answer.
 *
 * A filtered image renders through `<root>?v=<sig>&filters=<canonical>`, a URL
 * nothing else ever fetches, so warming the root asset instead leaves the
 * variant cold and the element paints blank for the length of the fetch (#344).
 * Hosts that keep the SVG source inlined resolve variants to a `data:` URI:
 * nothing to fetch, and building one means parsing and rewriting the whole
 * SVG, so those are skipped without paying for it.
 */
export const resolveImageSrcs = (
  context: Context | undefined,
  names: Iterable<string>,
): string[] => {
  const out: string[] = [];
  if (!context) {
    return out;
  }
  const seen = new Set<string>();
  const push = (src: unknown) => {
    if (
      typeof src === "string" &&
      src &&
      !src.startsWith("data:") &&
      !seen.has(src)
    ) {
      seen.add(src);
      out.push(src);
    }
  };
  for (const raw of names) {
    if (!raw || raw === "none") {
      continue;
    }
    const name = raw.includes("~") ? sortFilteredName(raw) : raw;
    const filtered = context["filtered_image"]?.[name];
    if (filtered) {
      if (rootHasInlinedData(context, filtered)) {
        continue;
      }
      // The copy is the whole point — see above. It is shallow, which is
      // enough: `filterImage` only ever writes `filtered_src` and
      // `filtered_layers` at the top level.
      const scratch = { ...filtered };
      filterImage(context, scratch);
      if (typeof scratch["filtered_src"] === "string") {
        push(scratch["filtered_src"]);
        continue;
      }
      // A LAYERED root yields the layers the filter kept instead of one
      // flattened src; each is a plain `image`.
      const layers = scratch["filtered_layers"];
      if (Array.isArray(layers) && layers.length > 0) {
        for (const layer of layers) {
          push(imageSrcOf(context, layer));
        }
        continue;
      }
    }
    const layered = context["layered_image"]?.[name];
    if (layered) {
      const assets = layered["assets"];
      const refs = Array.isArray(assets)
        ? assets
        : assets && typeof assets === "object"
          ? Object.values(assets)
          : [];
      for (const ref of refs) {
        push(imageSrcOf(context, ref));
      }
      continue;
    }
    push(context["image"]?.[name]?.["src"]);
  }
  return out;
};

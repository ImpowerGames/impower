import { filterImage } from "./filterImage";
import { resolveImageReference } from "./resolveImageReference";

/**
 * Resolve an image-ish context struct down to something an `<img src>` can
 * actually load.
 *
 * Only plain `image` structs carry a `src` — `populateAssets` copies it off the
 * workspace file. `layered_image.assets` and `filtered_image.image` hold bare
 * REFERENCES (`{ $type, $name }`, and `$type` is the empty string for a bare
 * name), so reading `.src` straight off one always yields `undefined`. Anything
 * wanting a preview has to walk the reference chain to the underlying `image`.
 *
 * A `layered_image` previews as its first layer: `assets` may be an array
 * (`assets = { a, b }`) or a keyed table (`assets = { base = a, prop = b }`),
 * so take the first VALUE either way rather than indexing `[0]`.
 */
export const getImagePreviewSrc = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): string | undefined => {
  if (!struct || typeof struct !== "object") {
    return undefined;
  }
  if (visited.has(struct)) {
    // Circular reference chain — bail rather than recurse forever.
    return undefined;
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    return struct["src"] || struct["data"] || struct["uri"] || undefined;
  }

  if (type === "filtered_image") {
    // Computes `filtered_src` when the root is an SVG (the only case that can
    // be filtered into a standalone source). No-op if already computed.
    if (context) {
      filterImage(context, struct);
    }
    if (struct["filtered_src"]) {
      return struct["filtered_src"];
    }
    // Raster or layered root: nothing to filter, so preview the root itself.
    return getImagePreviewSrc(
      context,
      resolveImageReference(context, struct["image"]),
      visited,
    );
  }

  if (type === "layered_image") {
    const assets = struct["assets"];
    const layers = Array.isArray(assets)
      ? assets
      : assets && typeof assets === "object"
        ? Object.values(assets)
        : [];
    for (const layer of layers) {
      const src = getImagePreviewSrc(
        context,
        resolveImageReference(context, layer),
        visited,
      );
      if (src) {
        return src;
      }
    }
    return undefined;
  }

  if (!type) {
    // A bare reference (`{ $type: "", $name }`) that still needs resolving.
    // A struct with a real non-image `$type` is deliberately NOT chased by
    // name — a `character` named `hero` must not preview an image `hero`.
    const resolved = resolveImageReference(context, struct);
    if (resolved && resolved !== struct) {
      return getImagePreviewSrc(context, resolved, visited);
    }
  }
  return undefined;
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Markdown/HTML preview for an image-ish struct, shared by hover and
 * completion so the two never disagree about what an asset looks like.
 * Returns `undefined` when nothing loadable could be resolved.
 */
export const getImagePreviewMarkup = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
): string | undefined => {
  const src = getImagePreviewSrc(context, struct);
  if (!src) {
    return undefined;
  }
  const name = struct?.["$name"] ?? "";
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(
    name,
  )}" height="180" />`;
};


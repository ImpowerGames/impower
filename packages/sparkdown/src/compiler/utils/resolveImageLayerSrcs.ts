import { filterImage } from "./filterImage";
import { resolveImageReference } from "./resolveImageReference";

/**
 * Flatten an image-ish struct into the ordered list of layer sources that make
 * it up, **bottom layer first**.
 *
 * That order is not arbitrary: `UIModule.createImage` reverses the asset list
 * before joining it into CSS `background-image` (whose first layer paints on
 * top), so `assets[0]` is the bottom-most layer in the running game. Anything
 * compositing these has to draw in the same order or the preview won't match.
 *
 * Returns `[]` when nothing resolves, and a single entry for a plain image —
 * callers treat "fewer than two layers" as "nothing to composite".
 */
export const resolveImageLayerSrcs = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): string[] => {
  if (!struct || typeof struct !== "object" || visited.has(struct)) {
    return [];
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    const src = struct["src"] || struct["data"] || struct["uri"];
    return src ? [src] : [];
  }

  if (type === "filtered_image") {
    if (context) {
      filterImage(context, struct);
    }
    if (struct["filtered_src"]) {
      // A filtered SVG is already a single flattened source.
      return [struct["filtered_src"]];
    }
    return resolveImageLayerSrcs(
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
    return layers.flatMap((layer) =>
      resolveImageLayerSrcs(
        context,
        resolveImageReference(context, layer),
        // Branch the guard per layer rather than sharing it: it exists to stop
        // cycles along one path, and sharing it would silently drop a layer
        // that legitimately reuses an asset an earlier layer already used.
        new Set(visited),
      ),
    );
  }

  if (!type) {
    const resolved = resolveImageReference(context, struct);
    if (resolved && resolved !== struct) {
      return resolveImageLayerSrcs(context, resolved, visited);
    }
  }
  return [];
};

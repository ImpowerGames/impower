import { filterImage } from "./filterImage";
import { resolveImageReference } from "./resolveImageReference";

/** One layer of a flattened image: how to display it, and how to read it. */
export interface ImageLayer {
  /**
   * Directly usable source (a served url, or a `data:` uri for inlined SVG).
   * Always present — this is what a preview renders when no compositing is
   * needed.
   */
  src: string;
  /**
   * Workspace uri, when the layer came from a file. Hosts that can't `fetch`
   * a layer's `src` (VS Code, whose srcs are workspace uris a worker cannot
   * fetch) read the bytes through this instead.
   */
  uri?: string;
}

/**
 * Flatten an image-ish struct into the ordered layers that make it up,
 * **bottom layer first**.
 *
 * That order is not arbitrary: `UIModule.createImage` reverses the asset list
 * before joining it into CSS `background-image` (whose first layer paints on
 * top), so `assets[0]` is the bottom-most layer in the running game. Anything
 * compositing these has to draw in the same order or the preview won't match.
 *
 * Returns `[]` when nothing resolves, and a single entry for a plain image —
 * callers treat "fewer than two layers" as "nothing to composite".
 */
export const resolveImageLayers = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): ImageLayer[] => {
  if (!struct || typeof struct !== "object" || visited.has(struct)) {
    return [];
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    const src = struct["src"] || struct["data"] || struct["uri"];
    return src ? [{ src, uri: struct["uri"] }] : [];
  }

  if (type === "filtered_image") {
    if (context) {
      filterImage(context, struct);
    }
    if (struct["filtered_src"]) {
      // A filtered SVG is already a single flattened source, inline in the
      // context — there is no file to read behind it.
      return [{ src: struct["filtered_src"] }];
    }
    return resolveImageLayers(
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
      resolveImageLayers(
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
      return resolveImageLayers(context, resolved, visited);
    }
  }
  return [];
};

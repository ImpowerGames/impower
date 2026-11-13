import { filterImage } from "./filterImage";
import { resolveImageMember, resolveImageReference, resolveImageRoot } from "./resolveImageReference";

export const getImagePreviewSrc = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): string | undefined => {
  if (!struct || typeof struct !== "object") {
    return undefined;
  }
  if (visited.has(struct)) {
    return undefined;
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    if (context && struct.attribute_vocabulary) {
      const src = filterImage(context, struct).src;
      if (src) return src;
    }
    return struct["src"] || struct["data"] || struct["uri"] || undefined;
  }

  if (type === "filtered_image") {
    const filtered = context ? filterImage(context, struct) : {};
    if (filtered.src) {
      return filtered.src;
    }
    const filteredLayers = filtered.layers;
    if (filteredLayers) {
      visited.add(resolveImageRoot(context, struct));
      for (const layer of filteredLayers) {
        const src = getImagePreviewSrc(
          context,
          resolveImageMember(context, layer, visited),
          visited,
        );
        if (src) {
          return src;
        }
      }
      return undefined;
    }
    return getImagePreviewSrc(
      context,
      resolveImageReference(context, struct["image"]),
      visited,
    );
  }

  if (type === "layered_image") {
    const assets = (context ? filterImage(context, struct).layers : undefined) ?? struct["assets"];
    const layers = Array.isArray(assets)
      ? assets
      : assets && typeof assets === "object"
        ? Object.values(assets)
        : [];
    for (const layer of layers) {
      const src = getImagePreviewSrc(
        context,
        resolveImageMember(context, layer, visited),
        visited,
      );
      if (src) {
        return src;
      }
    }
    return undefined;
  }

  if (!type) {
    const resolved = resolveImageReference(context, struct);
    if (resolved && resolved !== struct) {
      return getImagePreviewSrc(context, resolved, visited);
    }
  }
  return undefined;
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const IMAGE_PREVIEW_HEIGHT = 180;

// workaround(vscode): the markdown sanitizer drops the style attribute, so the thumbnail height is also written as an HTML height attribute (https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/markdownRenderer.ts)
export const buildImagePreviewMarkup = (src: string, name: string): string =>
  `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(
    name,
  )}" height="${IMAGE_PREVIEW_HEIGHT}" style="height:${IMAGE_PREVIEW_HEIGHT}px" />`;

export const getImagePreviewMarkup = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
): string | undefined => {
  const src = getImagePreviewSrc(context, struct);
  if (!src) {
    return undefined;
  }
  const name = struct?.["$name"] ?? "";
  return buildImagePreviewMarkup(src, name);
};

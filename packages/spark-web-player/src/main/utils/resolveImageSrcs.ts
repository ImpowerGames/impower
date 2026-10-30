import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getContextEntry } from "@impower/sparkdown/src/compiler/utils/getContextEntry";
import { sortFilteredName } from "@impower/sparkdown/src/compiler/utils/sortFilteredName";

type Context = { [type: string]: { [name: string]: any } };

export const rootHasInlinedData = (
  context: Context,
  filteredImage: any,
): boolean => {
  const seen = new Set<string>();
  let name = filteredImage?.["image"]?.["$name"];
  while (typeof name === "string" && !seen.has(name)) {
    seen.add(name);
    const image = getContextEntry(context, "image", name);
    if (image) {
      return !!image["data"];
    }
    const nested = getContextEntry(context, "filtered_image", name);
    if (!nested) {
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
  const image = getContextEntry(context, "image", name);
  return typeof image?.["src"] === "string" ? image["src"] : undefined;
};

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
    const name = sortFilteredName(raw);
    const filtered = getContextEntry(context, "filtered_image", name);
    if (filtered) {
      if (rootHasInlinedData(context, filtered)) {
        continue;
      }
      const scratch = { ...filtered };
      filterImage(context, scratch);
      if (typeof scratch["filtered_src"] === "string") {
        push(scratch["filtered_src"]);
        continue;
      }
      const layers = scratch["filtered_layers"];
      if (Array.isArray(layers) && layers.length > 0) {
        for (const layer of layers) {
          push(imageSrcOf(context, layer));
        }
        continue;
      }
    }
    const layered = getContextEntry(context, "layered_image", name);
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
    push(getContextEntry(context, "image", name)?.["src"]);
  }
  return out;
};

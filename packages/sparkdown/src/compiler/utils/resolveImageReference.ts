import { getContextEntry } from "./getContextEntry";

type ImageContext = { [type: string]: { [name: string]: any } };

export const typedImageTypes = (type: string): string[] =>
  type === "image" ? ["image", "layered_image"] : [type];

export const getTypedImageEntry = (
  context: ImageContext | undefined,
  type: string,
  name: string,
): any => {
  for (const table of typedImageTypes(type)) {
    const entry = getContextEntry(context, table, name);
    if (entry !== undefined) return entry;
  }
  return undefined;
};

const UNTYPED_IMAGE_TYPES = ["filtered_image", "image", "layered_image"];

export const resolveImageReference = (
  context: ImageContext | undefined,
  ref: any,
): any => {
  if (!ref || typeof ref !== "object" || !ref["$name"]) {
    return undefined;
  }
  const name = ref["$name"];
  if (ref["$type"]) {
    return getTypedImageEntry(context, ref["$type"], name);
  }
  for (const type of UNTYPED_IMAGE_TYPES) {
    const entry = getContextEntry(context, type, name);
    if (entry !== undefined) return entry;
  }
  return undefined;
};

export const resolveImageRoot = (
  context: ImageContext | undefined,
  struct: any,
): any => {
  const seen = new Set<any>();
  let current = struct;
  while (current?.["$type"] === "filtered_image" && !seen.has(current)) {
    seen.add(current);
    const ref = current["image"];
    current = !ref?.["$name"]
      ? undefined
      : ref["$type"]
        ? getTypedImageEntry(context, ref["$type"], ref["$name"])
        : getContextEntry(context, "filtered_image", ref["$name"]) ??
          getContextEntry(context, "layered_image", ref["$name"]) ??
          getContextEntry(context, "image", ref["$name"]);
  }
  return current;
};

export const resolveImageMember = (
  context: ImageContext | undefined,
  ref: any,
  containing: ReadonlySet<any>,
): any => {
  if (!ref || typeof ref !== "object" || !ref["$name"] || ref["$type"]) {
    return resolveImageReference(context, ref);
  }
  for (const type of UNTYPED_IMAGE_TYPES) {
    const entry = getContextEntry(context, type, ref["$name"]);
    if (entry === undefined || containing.has(entry)) continue;
    if (type === "filtered_image" && containing.has(resolveImageRoot(context, entry))) continue;
    return entry;
  }
  return undefined;
};

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

export const UNTYPED_IMAGE_TYPES = ["filtered_image", "image", "layered_image"];

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

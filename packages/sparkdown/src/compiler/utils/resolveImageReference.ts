import { getContextEntry } from "./getContextEntry";

type ImageContext = { [type: string]: { [name: string]: any } };

export const getTypedImageEntry = (
  context: ImageContext | undefined,
  type: string,
  name: string,
): any =>
  getContextEntry(context, type, name) ??
  (type === "image" ? getContextEntry(context, "layered_image", name) : undefined);

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
  return (
    getContextEntry(context, "filtered_image", name) ??
    getContextEntry(context, "image", name) ??
    getContextEntry(context, "layered_image", name)
  );
};

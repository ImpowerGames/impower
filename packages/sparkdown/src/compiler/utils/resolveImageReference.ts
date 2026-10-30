import { getContextEntry } from "./getContextEntry";

export const resolveImageReference = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  ref: any,
): any => {
  if (!ref || typeof ref !== "object" || !ref["$name"]) {
    return undefined;
  }
  const name = ref["$name"];
  if (ref["$type"]) {
    return getContextEntry(context, ref["$type"], name);
  }
  return (
    getContextEntry(context, "filtered_image", name) ??
    getContextEntry(context, "image", name) ??
    getContextEntry(context, "layered_image", name)
  );
};

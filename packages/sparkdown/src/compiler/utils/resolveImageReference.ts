import { getContextEntry } from "./getContextEntry";

/**
 * Look a `{ $type, $name }` reference up in the compiled context.
 *
 * A bare name in a `.sd` table lowers to `$type: ""`, meaning "search every
 * type by name", so fall back to the image types in specificity order —
 * `filtered_image` first, because an SVG asset gets an implicit filtered_image
 * declared for it and that is the variant a preview should show.
 */
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

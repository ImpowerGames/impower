import { getContextEntry } from "@impower/sparkdown/src/compiler/utils/getContextEntry";

export const getImageOwner = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  name: string | undefined,
): string | undefined => {
  const seen = new Set<string>();
  let current = name;
  while (current && !seen.has(current)) {
    seen.add(current);
    const at = current.indexOf("@");
    const thing = at > 0 ? current.slice(0, at) : current;
    if (!thing.startsWith("$") && getContextEntry(context, "character", thing)) {
      return thing;
    }
    const base = getContextEntry(context, "filtered_image", current)?.["image"];
    current = typeof base === "string" ? base : base?.["$name"];
  }
  return undefined;
};

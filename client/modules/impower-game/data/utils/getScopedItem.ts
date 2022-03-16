import { getAncestorIds } from "./getAncestorIds";

export const getScopedItem = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string,
  localOnlyPrefix: "" | "param-" = ""
): T => {
  const ids = getAncestorIds(sectionId);
  const foundSectionId =
    ids.find((x) => Boolean(items?.[`${x}.${name}`])) || "";
  const found =
    items?.[`${sectionId}.${localOnlyPrefix}${name}`] ||
    items?.[`${foundSectionId}.${name}`];
  return found;
};

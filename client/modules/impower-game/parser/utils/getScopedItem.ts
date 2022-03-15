import { getAncestorIds } from "../../data/utils/getAncestorIds";

export const getScopedItem = <T>(
  name: string,
  sectionId: string,
  items: Record<string, T>,
  localOnlyPrefix = "param-"
): T => {
  const ids = getAncestorIds(sectionId);
  const foundSectionId =
    ids.find((x) => Boolean(items?.[`${x}.${name}`])) || "";
  const found =
    items?.[`${sectionId}.${localOnlyPrefix}${name}`] ||
    items?.[`${foundSectionId}.${name}`];
  if (found) {
    return found;
  }
  return undefined;
};

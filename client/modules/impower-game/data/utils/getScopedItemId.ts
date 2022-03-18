import { getAncestorIds } from "./getAncestorIds";

export const getScopedItemId = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string,
  localOnlyPrefixes: "parameter"[] = []
): string => {
  if (localOnlyPrefixes?.length > 0) {
    for (let i = 0; i < localOnlyPrefixes.length; i += 1) {
      const localOnlyPrefix = localOnlyPrefixes[i];
      const prefix = localOnlyPrefix ? `${localOnlyPrefix}-` : "";
      const foundId = `${sectionId}.${prefix}${name}`;
      const localFound = items?.[foundId];
      if (localFound) {
        return foundId;
      }
    }
  }
  const ids = getAncestorIds(sectionId);
  const foundSectionId =
    ids.find((x) => Boolean(items?.[`${x}.${name}`])) || "";
  const foundId = `${foundSectionId}.${name}`;
  if (items?.[foundId]) {
    return foundId;
  }
  return undefined;
};

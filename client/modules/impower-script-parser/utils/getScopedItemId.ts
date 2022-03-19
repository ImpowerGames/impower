import { getAncestorIds } from "./getAncestorIds";

export const getScopedItemId = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string
): string => {
  const foundPrivateId = `${sectionId}.private-${name}`;
  const localFound = items?.[foundPrivateId];
  if (localFound) {
    return foundPrivateId;
  }
  const ids = getAncestorIds(sectionId);
  const foundSectionId =
    ids.find((x) => Boolean(items?.[`${x}.${name}`])) || "";
  const foundProtectedId = `${foundSectionId}.${name}`;
  if (items?.[foundProtectedId]) {
    return foundProtectedId;
  }
  return undefined;
};

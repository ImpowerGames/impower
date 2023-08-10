import getAncestorIds from "./getAncestorIds";

const getScopedItemId = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string
): string | undefined => {
  const ids = getAncestorIds(sectionId);
  const foundSectionId =
    ids.find((x) => Boolean(items?.[`${x}.${name}`])) || "";
  const foundProtectedId = `${foundSectionId}.${name}`;
  if (items?.[foundProtectedId]) {
    return foundProtectedId;
  }
  return undefined;
};

export default getScopedItemId;

import { getScopedItemId } from "./getScopedItemId";

export const getScopedItem = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string,
  localOnlyPrefixes: "parameter"[] = []
): T => {
  const id = getScopedItemId(items, sectionId, name, localOnlyPrefixes);
  if (id) {
    return items[id];
  }
  return undefined;
};

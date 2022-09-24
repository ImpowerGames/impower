import { getScopedItemId } from "./getScopedItemId";

export const getScopedItem = <T>(
  items: Record<string, T>,
  sectionId: string,
  name: string
): [string | undefined, T | undefined] => {
  const id = getScopedItemId(items, sectionId, name);
  if (id) {
    return [id, items[id]];
  }
  return [undefined, undefined];
};

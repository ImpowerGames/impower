import { getAncestorIds } from "./getAncestorIds";

export const getScopedValues = (
  blockId: string,
  blocks: Record<
    string,
    {
      variables?: Record<
        string,
        { name: string; value: string | number | boolean }
      >;
      assets?: Record<string, { name: string; value: string }>;
      entities?: Record<string, { name: string; value: string }>;
      tags?: Record<string, { name: string; value: string }>;
    }
  >,
  itemsProp: "variables" | "assets" | "entities" | "tags"
): Record<string, string | number | boolean> => {
  const ancestorIds = getAncestorIds(blockId);
  const result: Record<string, string | number | boolean> = {};
  ancestorIds.forEach((ancestorId) => {
    const section = blocks?.[ancestorId];
    const items: Record<
      string,
      { name: string; value: string | number | boolean }
    > = section?.[itemsProp];
    Object.values(items).forEach((v) => {
      result[v.name] = v.value;
    });
  });
  return result;
};

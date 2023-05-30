import { getScopedIds } from "./getScopedIds";
import { getScopedSectionIds } from "./getScopedSectionIds";

export const getScopedContext = <T>(
  itemsProp: "variables" | "sections",
  sectionId: string,
  sections?: Record<
    string,
    {
      name: string;
      parent?: string;
      children?: string[];
      variables?: Record<string, { name: string; value: unknown }>;
    }
  >
): [Record<string, string>, Record<string, T>] => {
  const validSectionId = sectionId || "";
  const valueMap: Record<string, T> = {};
  if (itemsProp === "sections") {
    const ids = getScopedSectionIds(validSectionId, sections);
    Object.values(ids).forEach((id) => {
      const v = sections?.[id];
      if (v) {
        valueMap[v.name || ""] = 0 as unknown as T;
      }
    });
    ids["#"] = validSectionId;
    valueMap["#"] = [0, ""] as unknown as T;
    return [ids, valueMap];
  }
  const ids = getScopedIds(validSectionId, sections);
  Object.values(ids).forEach((id) => {
    const parentId = id.split(".").slice(0, -1).join(".");
    const items = sections?.[parentId]?.[itemsProp];
    const v = items?.[id];
    if (v) {
      valueMap[v.name || ""] = v.value as T;
    }
  });
  return [ids, valueMap];
};

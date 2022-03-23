import { SparkSection } from "../types/SparkSection";
import { getScopedIds } from "./getScopedIds";
import { getScopedSectionIds } from "./getScopedSectionIds";

export const getScopedContext = <T extends string | number | boolean>(
  sectionId: string,
  sections: Record<string, SparkSection>,
  itemsProp: "variables" | "assets" | "entities" | "tags" | "sections"
): [Record<string, string>, Record<string, T>] => {
  const valueMap: Record<string, T> = {};
  if (itemsProp === "sections") {
    const ids = getScopedSectionIds(sectionId, sections);
    Object.values(ids).forEach((id) => {
      const v = sections[id];
      valueMap[v.name] = 0 as T;
    });
    return [ids, valueMap];
  }
  const ids = getScopedIds(sectionId, sections, itemsProp);
  Object.values(ids).forEach((id) => {
    const parentId = id.split(".").slice(0, -1).join(".");
    const items = sections?.[parentId]?.[itemsProp];
    const v = items?.[id];
    valueMap[v.name] = v.value as T;
  });
  return [ids, valueMap];
};

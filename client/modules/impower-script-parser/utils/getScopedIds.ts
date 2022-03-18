import { FountainSection } from "../types/FountainSection";
import { getAncestorIds } from "./getAncestorIds";

export const getScopedIds = (
  sectionId: string,
  sections: Record<string, FountainSection>,
  itemsProp: "variables" | "assets" | "entities" | "tags"
): Record<string, string> => {
  const ancestorIds = getAncestorIds(sectionId);
  const result: Record<string, string> = {};
  ancestorIds.forEach((ancestorId) => {
    const section = sections?.[ancestorId];
    const items = section?.[itemsProp] || {};
    if (Array.isArray(items)) {
      items.forEach((id) => {
        const name = id.split(".").slice(-1).join("").replace(/^[*?]/, "");
        result[name] = id;
      });
    } else {
      Object.entries(items).forEach(([id, v]) => {
        result[v.name] = id;
      });
    }
  });
  return result;
};

import { FountainSection } from "../types/FountainSection";
import { getAncestorIds } from "./getAncestorIds";

export const getScopedSectionIds = (
  sectionId: string,
  sections: Record<string, FountainSection>
): Record<string, string> => {
  const result: Record<string, string> = {};
  const childrenIds = sections?.[sectionId]?.children || [];
  childrenIds.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  const ancestorIds = getAncestorIds(sectionId);
  ancestorIds.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  return result;
};

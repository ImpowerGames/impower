import { SparkSection } from "../types/SparkSection";
import { getAncestorIds } from "./getAncestorIds";

export const getScopedSectionIds = (
  sectionId: string,
  sections: Record<string, SparkSection>
): Record<string, string> => {
  const validSectionId = sectionId || "";
  const result: Record<string, string> = {};
  const section = sections?.[validSectionId];
  const childrenIds = section?.children || [];
  childrenIds.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  const ancestorIds = getAncestorIds(validSectionId);
  ancestorIds.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  const parentId = section?.parent;
  if (parentId != null) {
    const siblingIds = sections?.[parentId]?.children || [];
    siblingIds.forEach((id) => {
      const section = sections?.[id];
      if (section) {
        result[section.name] = id;
      }
    });
  }
  return result;
};

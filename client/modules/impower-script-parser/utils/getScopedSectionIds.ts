import { SparkSection } from "../types/SparkSection";
import { getAncestorIds } from "./getAncestorIds";

export const getScopedSectionIds = (
  sectionId: string,
  sections: Record<string, SparkSection>
): Record<string, string> => {
  const result: Record<string, string> = {};
  const section = sections?.[sectionId || ""];
  const childrenIds = section?.children || [];
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

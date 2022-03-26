import { SparkSection } from "../types/SparkSection";
import { getAncestorIds } from "./getAncestorIds";
import { getChildrenIds } from "./getChildrenIds";
import { getSiblingIds } from "./getSiblingIds";

export const getScopedSectionIds = (
  sectionId: string,
  sections: Record<string, SparkSection>
): Record<string, string> => {
  const validSectionId = sectionId || "";
  const result: Record<string, string> = {};
  const childrenIds = getChildrenIds(sectionId, sections);
  childrenIds?.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  const siblingIds = getSiblingIds(sectionId, sections);
  siblingIds?.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  const ancestorIds = getAncestorIds(validSectionId);
  ancestorIds?.forEach((id) => {
    const section = sections?.[id];
    if (section) {
      result[section.name] = id;
    }
  });
  return result;
};

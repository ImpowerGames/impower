import { SparkSection } from "../types/SparkSection";

export const getSiblingIds = (
  sectionId: string,
  sections: Record<string, SparkSection>
): string[] => {
  const validSectionId = sectionId || "";
  const result: string[] = [];
  const section = sections?.[validSectionId];
  const parentId = section?.parent;
  if (parentId != null) {
    const siblingIds = sections?.[parentId]?.children || [];
    siblingIds.forEach((id) => {
      const section = sections?.[id];
      if (section) {
        result.push(id);
      }
    });
  }
  return result || [];
};

import { SparkSection } from "../types/SparkSection";

export const getChildrenIds = (
  sectionId: string,
  sections: Record<string, SparkSection>
): string[] => {
  const validSectionId = sectionId || "";
  const section = sections?.[validSectionId];
  return section?.children || [];
};

import getAncestorIds from "./getAncestorIds";
import getChildrenIds from "./getChildrenIds";
import getSiblingIds from "./getSiblingIds";

const getScopedSectionIds = (
  sectionId: string,
  sections?: Record<
    string,
    { name: string; parent?: string; children?: string[] }
  >
): Record<string, string> => {
  const validSectionId = sectionId || "";
  const result: Record<string, string> = {};
  const childrenIds = getChildrenIds(sectionId, sections);
  childrenIds?.forEach((id) => {
    const section = sections?.[id];
    if (section && section.name !== undefined) {
      result[section.name] = id;
    }
  });
  const siblingIds = getSiblingIds(sectionId, sections);
  siblingIds?.forEach((id) => {
    const section = sections?.[id];
    if (section && section.name !== undefined) {
      result[section.name] = id;
    }
  });
  const ancestorIds = getAncestorIds(validSectionId);
  ancestorIds?.forEach((id) => {
    const section = sections?.[id];
    if (section && section.name !== undefined) {
      result[section.name] = id;
    }
  });
  return result;
};

export default getScopedSectionIds;

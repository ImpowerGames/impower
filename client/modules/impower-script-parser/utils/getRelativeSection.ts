import { SparkSection } from "../types/SparkSection";

export const getRelativeSection = (
  ancestorIds: string[],
  sections: Record<string, SparkSection>,
  operator: ">" | "]" | "[" | "^"
): [string, SparkSection] => {
  const sectionId = ancestorIds?.[0];
  const parentId = ancestorIds?.[1];

  if (operator === "]") {
    const siblings = sections?.[parentId]?.children || [];
    const id = [...siblings]
      .reverse()
      .find((id) => sections?.[id]?.type === "section");
    if (id != null) {
      return [id, sections?.[id]];
    }
  }
  if (operator === "[") {
    const siblings = sections?.[parentId]?.children || [];
    const id = siblings.find((id) => sections?.[id]?.type === "section");
    if (id != null) {
      return [id, sections?.[id]];
    }
  }
  if (operator === "^") {
    if (parentId != null) {
      return [parentId, sections?.[parentId]];
    }
  }
  if (operator === ">") {
    const sectionIds = Object.keys(sections || {});
    const sectionIndex = sectionIds.indexOf(sectionId);
    const id = sectionIds
      .slice(sectionIndex + 1)
      ?.find((id) => sections?.[id]?.type === "section");
    if (id != null) {
      return [id, sections?.[id]];
    }
  }

  return [undefined, undefined];
};

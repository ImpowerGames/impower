const getRelativeSectionName = <
  T extends {
    name: string;
    parent?: string;
    children?: string[];
  }
>(
  currentSectionId: string,
  sections: Record<string, T>,
  expression: "<<" | ">>" | "--" | "++" | "<<--" | string
): string => {
  if (expression === "<<") {
    // FIRST SIBLING
    const parentId = sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = sections?.[parentId]?.children;
      const firstSiblingId = siblingIds?.at(0);
      if (firstSiblingId != null) {
        const firstSibling = sections?.[firstSiblingId];
        if (firstSibling) {
          return firstSibling.name;
        }
      }
    }
    return Object.values(sections).at(0)?.name || "";
  }
  if (expression === ">>") {
    // LAST SIBLING
    const parentId = sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const siblingIds = sections?.[parentId]?.children;
      if (siblingIds) {
        const lastSiblingId = siblingIds.at(-1);
        if (lastSiblingId != null) {
          const lastSibling = sections?.[lastSiblingId];
          if (lastSibling) {
            return lastSibling.name;
          }
        }
      }
    }
    return Object.values(sections).at(-1)?.name || "";
  }
  if (expression === "--") {
    // PREVIOUS SECTION
    const sectionsArray = Object.values(sections);
    const block = sections?.[currentSectionId];
    if (block) {
      const blockIndex = sectionsArray.indexOf(block);
      const prevSection = sectionsArray.at(blockIndex - 1);
      if (prevSection) {
        return prevSection.name;
      }
    }
    return sectionsArray.at(0)?.name || "";
  }
  if (expression === "++") {
    // NEXT SECTION
    const sectionsArray = Object.values(sections);
    const block = sections?.[currentSectionId];
    if (block) {
      const blockIndex = sectionsArray.indexOf(block);
      const nextSection = sectionsArray.at(blockIndex + 1);
      if (nextSection) {
        return nextSection.name;
      }
    }
    return sectionsArray.at(-1)?.name || "";
  }
  if (expression === "<<--") {
    // PARENT
    const parentId = sections?.[currentSectionId]?.parent;
    if (parentId != null) {
      const parent = sections?.[parentId];
      if (parent) {
        return parent.name;
      }
    }
    const sectionsArray = Object.values(sections);
    return sectionsArray.at(0)?.name || "";
  }
  if (expression === "^") {
    // THIS (repeat current section)
    const currentSection = sections?.[currentSectionId];
    if (currentSection != null) {
      return currentSection?.name;
    }
    const sectionsArray = Object.values(sections);
    return sectionsArray.at(0)?.name || "";
  }
  return expression;
};

export default getRelativeSectionName;
